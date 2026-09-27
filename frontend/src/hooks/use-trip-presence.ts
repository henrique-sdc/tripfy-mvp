// Presença da sala no Realtime Database.
// 1 write ao entrar + onDisconnect. Sem heartbeat no Firestore.

import { onDisconnect, onValue, ref, remove, set, update } from "firebase/database";
import { useEffect, useRef, useState } from "react";

import { auth, rtdb } from "@/lib/firebase";

export type PresencePeer = {
  uid: string;
  name: string;
  photoUrl: string | null;
  focusedActivityId: string | null;
};

function httpPhoto(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url.startsWith("https://") && !url.startsWith("http://")) return null;
  return url;
}

/**
 * Quem está no detalhe desta viagem. `focusedActivityId` muda só quando o
 * card em foco muda — nunca por tecla.
 */
export function useTripPresence(opts: {
  enabled: boolean;
  tripId: string | null;
  name: string;
  photoUrl: string | null;
  focusedActivityId: string | null;
}): PresencePeer[] {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const { enabled, tripId, name, photoUrl, focusedActivityId } = opts;
  const focusRef = useRef(focusedActivityId);
  focusRef.current = focusedActivityId;

  useEffect(() => {
    if (!enabled || !tripId || !rtdb) {
      setPeers([]);
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const mine = ref(rtdb, `presence/${tripId}/${uid}`);
    const room = ref(rtdb, `presence/${tripId}`);
    let cancelled = false;

    const publish = () => {
      onDisconnect(mine)
        .remove()
        .then(() =>
          set(mine, {
            name: name.trim(),
            photo_url: httpPhoto(photoUrl),
            focused_activity_id: focusRef.current,
          }),
        )
        .catch((err) => {
          console.warn("[presence] entrada falhou:", err);
        });
    };

    const connected = onValue(ref(rtdb, ".info/connected"), (snap) => {
      if (snap.val() === true) publish();
    });

    const unlisten = onValue(
      room,
      (snap) => {
        if (cancelled) return;
        const raw = snap.val() as Record<string, unknown> | null;
        if (!raw) {
          setPeers([]);
          return;
        }
        const next: PresencePeer[] = [];
        for (const [peerUid, value] of Object.entries(raw)) {
          if (!value || typeof value !== "object") continue;
          const row = value as {
            name?: unknown;
            photo_url?: unknown;
            focused_activity_id?: unknown;
          };
          next.push({
            uid: peerUid,
            name: typeof row.name === "string" ? row.name.trim() : "",
            photoUrl: httpPhoto(row.photo_url),
            focusedActivityId:
              typeof row.focused_activity_id === "string"
                ? row.focused_activity_id
                : null,
          });
        }
        next.sort((a, b) => a.uid.localeCompare(b.uid));
        setPeers(next);
      },
      (err) => {
        console.warn("[presence] sala indisponível:", err);
        if (!cancelled) setPeers([]);
      },
    );

    return () => {
      cancelled = true;
      connected();
      unlisten();
      remove(mine).catch(() => undefined);
    };
  }, [enabled, tripId, name, photoUrl]);

  useEffect(() => {
    if (!enabled || !tripId || !rtdb) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    update(ref(rtdb, `presence/${tripId}/${uid}`), {
      focused_activity_id: focusedActivityId,
    }).catch(() => undefined);
  }, [enabled, focusedActivityId, tripId]);

  return peers;
}
