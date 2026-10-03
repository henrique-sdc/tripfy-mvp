// Sala de edição: onSnapshot no doc canônico + uma op em voo.
// O drag não aplica snapshot — isso remonta o DraggableFlatList no meio do gesto.

import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  getTripApi,
  postTripOp,
  type SavedTripApi,
} from "@/lib/api";
import {
  bumpQueuedBases,
  createQueuedOp,
  decideSnapshot,
  enqueueOp,
  type CollabOpType,
} from "@/lib/collabQueue";
import { auth, db } from "@/lib/firebase";
import type { ChangeEntry } from "@/lib/changeLog";
import { tripFromDoc, type SavedTrip } from "@/lib/trips";

export type CollabEnqueue = {
  type: CollabOpType;
  payload: Record<string, unknown>;
  coalesceKey?: string;
  debounceMs?: number;
};

type Options = {
  enabled: boolean;
  tripId: string | null;
  ownerUid: string | null;
  initialRevision: number;
  onRemote: (trip: SavedTrip) => void;
  onChangeLog?: (log: ChangeEntry[]) => void;
  onConflict: (code: string) => void;
  onStatus: (status: "saving" | "saved" | "error") => void;
};

function apiTripToSaved(trip: SavedTripApi): SavedTrip {
  const days = Array.isArray(trip.days) ? trip.days : [];
  return {
    id: trip.id,
    owner_uid: trip.owner_uid,
    destination: trip.destination,
    title: trip.title,
    summary: trip.summary,
    tips: trip.tips ?? [],
    local_life: trip.local_life ?? "",
    notes: trip.notes ?? "",
    days,
    start_date: trip.start_date,
    end_date: trip.end_date,
    match_id: trip.match_id ?? undefined,
    collab: trip.collab,
    revision: trip.revision ?? 0,
    last_op_id: trip.last_op_id,
    updated_by: trip.updated_by,
    updated_by_name: trip.updated_by_name,
    last_change: trip.last_change,
    last_change_day: trip.last_change_day,
    change_log: Array.isArray(trip.change_log) ? trip.change_log : undefined,
    updated_at: trip.updated_at,
    role: trip.role,
    day_count: trip.day_count ?? days.length,
  };
}

function readConflict(
  err: unknown,
): { code: string; trip: SavedTripApi | null } | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 409 && err.status !== 422) return null;
  const payload = err.payload;
  if (!payload || typeof payload !== "object") {
    return { code: err.code ?? "revision_conflict", trip: null };
  }
  const raw = payload as { code?: unknown; trip?: unknown };
  const code =
    typeof raw.code === "string" ? raw.code : err.code ?? "revision_conflict";
  const trip =
    raw.trip && typeof raw.trip === "object"
      ? (raw.trip as SavedTripApi)
      : null;
  return { code, trip };
}

export function useCollabTrip(opts: Options) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const knownRevision = useRef(opts.initialRevision);
  const queueRef = useRef<ReturnType<typeof createQueuedOp>[]>([]);
  const inflightRef = useRef(false);
  const dragRef = useRef(false);
  const heldRef = useRef<SavedTrip | null>(null);
  const ownOps = useRef(new Set<string>());
  const debounceRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sem regras novas no Firebase, o convidado não lê o doc do dono.
  // A API ignora rules — poll é o plano B, não o caminho feliz.
  const [useApiPoll, setUseApiPoll] = useState(false);

  const pendingDebounce = () => debounceRef.current.size > 0;
  const queueBusy = () => inflightRef.current || queueRef.current.length > 0;

  const ingestRemote = useCallback((remote: SavedTrip) => {
    const decision = decideSnapshot({
      dragging: dragRef.current,
      busy: queueBusy() || pendingDebounce(),
      incomingRevision: remote.revision ?? 0,
      knownRevision: knownRevision.current,
      lastOpId: remote.last_op_id ?? null,
      ownOpIds: ownOps.current,
    });
    if (decision === "echo") {
      knownRevision.current = remote.revision ?? knownRevision.current;
      if (remote.change_log) optsRef.current.onChangeLog?.(remote.change_log);
      return;
    }
    if (decision === "ignore") return;
    if (decision === "hold") {
      heldRef.current = remote;
      return;
    }
    knownRevision.current = remote.revision ?? knownRevision.current;
    optsRef.current.onRemote(remote);
  }, []);

  useEffect(() => {
    if (!queueBusy() && !pendingDebounce()) {
      knownRevision.current = opts.initialRevision;
    }
  }, [opts.initialRevision]);

  const drainHeld = useCallback(() => {
    const held = heldRef.current;
    if (!held || dragRef.current || queueBusy() || pendingDebounce()) return;
    heldRef.current = null;
    const decision = decideSnapshot({
      dragging: false,
      busy: false,
      incomingRevision: held.revision ?? 0,
      knownRevision: knownRevision.current,
      lastOpId: held.last_op_id ?? null,
      ownOpIds: ownOps.current,
    });
    if (decision === "echo") {
      knownRevision.current = held.revision ?? knownRevision.current;
      if (held.change_log) optsRef.current.onChangeLog?.(held.change_log);
      return;
    }
    if (decision !== "apply") return;
    knownRevision.current = held.revision ?? knownRevision.current;
    optsRef.current.onRemote(held);
    optsRef.current.onStatus("saved");
  }, []);

  const flush = useCallback(() => {
    const tripId = optsRef.current.tripId;
    if (!optsRef.current.enabled || !tripId) return;
    if (inflightRef.current) return;
    const next = queueRef.current[0];
    if (!next) {
      if (!dragRef.current && !pendingDebounce()) {
        optsRef.current.onStatus("saved");
      }
      drainHeld();
      return;
    }

    inflightRef.current = true;
    optsRef.current.onStatus("saving");
    let failed = false;
    void postTripOp(tripId, {
      op_id: next.op_id,
      base_revision: next.base_revision,
      type: next.type,
      payload: next.payload,
    })
      .then((result) => {
        ownOps.current.add(next.op_id);
        if (ownOps.current.size > 40) {
          const oldest = ownOps.current.values().next().value;
          if (oldest) ownOps.current.delete(oldest);
        }
        queueRef.current = queueRef.current.slice(1);
        const revision = result.trip.revision ?? knownRevision.current;
        knownRevision.current = revision;
        queueRef.current = bumpQueuedBases(queueRef.current, revision);
        const saved = apiTripToSaved(result.trip);
        if (saved.change_log) optsRef.current.onChangeLog?.(saved.change_log);
        // Patch não remonta (eco). Reorder/delete pode ter rebaseado ids no servidor.
        if (result.applied && next.type !== "patch_activity" && next.type !== "patch_meta") {
          if (dragRef.current || queueRef.current.length > 0 || pendingDebounce()) {
            const held = heldRef.current;
            if (!held || (saved.revision ?? 0) >= (held.revision ?? 0)) {
              heldRef.current = saved;
            }
          } else {
            optsRef.current.onRemote(saved);
          }
        }
      })
      .catch((err: unknown) => {
        failed = true;
        const conflict = readConflict(err);
        if (conflict) {
          queueRef.current = [];
          for (const timer of debounceRef.current.values()) clearTimeout(timer);
          debounceRef.current.clear();
          heldRef.current = null;
          if (conflict.trip) {
            knownRevision.current =
              conflict.trip.revision ?? knownRevision.current;
            optsRef.current.onRemote(apiTripToSaved(conflict.trip));
          }
          optsRef.current.onConflict(conflict.code);
          optsRef.current.onStatus("saved");
          return;
        }
        console.warn("[collab] op falhou:", err);
        optsRef.current.onStatus("error");
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => {
          retryRef.current = null;
          flush();
        }, 1200);
      })
      .finally(() => {
        inflightRef.current = false;
        if (failed) return;
        if (queueRef.current.length > 0) flush();
        else drainHeld();
      });
  }, [drainHeld]);

  const enqueue = useCallback(
    (input: CollabEnqueue) => {
      if (!optsRef.current.enabled) return;
      const push = () => {
        const op = createQueuedOp(input, knownRevision.current);
        queueRef.current = enqueueOp(
          queueRef.current,
          op,
          inflightRef.current,
        );
        optsRef.current.onStatus("saving");
        flush();
      };
      const wait = input.debounceMs ?? 0;
      if (wait <= 0 || !input.coalesceKey) {
        push();
        return;
      }
      const key = input.coalesceKey;
      const prev = debounceRef.current.get(key);
      if (prev) clearTimeout(prev);
      debounceRef.current.set(
        key,
        setTimeout(() => {
          debounceRef.current.delete(key);
          push();
        }, wait),
      );
    },
    [flush],
  );

  useEffect(() => {
    if (!opts.enabled || !opts.tripId || !opts.ownerUid) return;
    setUseApiPoll(false);
    const ref = doc(db, "users", opts.ownerUid, "trips", opts.tripId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        setUseApiPoll(false);
        const uid = auth.currentUser?.uid ?? opts.ownerUid ?? "";
        ingestRemote(
          tripFromDoc(snap.id, snap.data() as Record<string, unknown>, uid),
        );
      },
      (err) => {
        console.warn("[collab] listener (cai no poll da API):", err);
        setUseApiPoll(true);
        optsRef.current.onStatus("error");
      },
    );
  }, [ingestRemote, opts.enabled, opts.ownerUid, opts.tripId]);

  useEffect(() => {
    if (!opts.enabled || !opts.tripId || !useApiPoll) return;
    const tripId = opts.tripId;
    let cancelled = false;

    const tick = async () => {
      try {
        const trip = await getTripApi(tripId);
        if (cancelled) return;
        ingestRemote(apiTripToSaved(trip));
        if (!dragRef.current && !queueBusy() && !pendingDebounce()) {
          optsRef.current.onStatus("saved");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[collab] poll da API falhou:", err);
        optsRef.current.onStatus("error");
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ingestRemote, opts.enabled, opts.tripId, useApiPoll]);

  useEffect(
    () => () => {
      for (const timer of debounceRef.current.values()) clearTimeout(timer);
      debounceRef.current.clear();
      if (retryRef.current) clearTimeout(retryRef.current);
    },
    [],
  );

  const releaseDrag = useCallback(() => {
    dragRef.current = false;
    drainHeld();
  }, [drainHeld]);

  return { enqueue, dragRef, releaseDrag };
}
