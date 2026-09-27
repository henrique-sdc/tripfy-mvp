// Fila da sala: uma op em voo, coalesce no mesmo card, snapshot não entra no drag.

import { newActivityId } from "@/lib/activityId";

export type CollabOpType =
  | "patch_activity"
  | "delete_activity"
  | "reorder_day"
  | "patch_meta"
  | "add_activity"
  | "add_day"
  | "delete_day";

export type QueuedOp = {
  op_id: string;
  type: CollabOpType;
  payload: Record<string, unknown>;
  base_revision: number;
  coalesceKey?: string;
};

export type SnapshotDecision = "ignore" | "echo" | "hold" | "apply";

export function createQueuedOp(
  input: Omit<QueuedOp, "op_id" | "base_revision"> & { op_id?: string },
  baseRevision: number,
): QueuedOp {
  return {
    op_id: input.op_id ?? newActivityId(),
    type: input.type,
    payload: input.payload,
    base_revision: baseRevision,
    coalesceKey: input.coalesceKey,
  };
}

/**
 * `inflight` trava o índice 0 — a op que já saiu pra rede não muda no meio.
 * Mesma coalesceKey substitui o payload e conserva op_id e base_revision.
 */
export function enqueueOp(
  queue: QueuedOp[],
  op: QueuedOp,
  inflight: boolean,
): QueuedOp[] {
  if (!op.coalesceKey) return [...queue, op];
  const start = inflight ? 1 : 0;
  const idx = queue.findIndex(
    (item, index) => index >= start && item.coalesceKey === op.coalesceKey,
  );
  if (idx < 0) return [...queue, op];
  const next = queue.slice();
  next[idx] = {
    ...op,
    op_id: queue[idx].op_id,
    base_revision: queue[idx].base_revision,
  };
  return next;
}

/** Depois que a NOSSA op commita, o resto da cadeia local usa a revisão nova. */
export function bumpQueuedBases(queue: QueuedOp[], revision: number): QueuedOp[] {
  return queue.map((op) => ({ ...op, base_revision: revision }));
}

/**
 * Eco da nossa op não remonta a lista. Snapshot estrangeiro durante o drag
 * ou com fila pendente fica retido.
 */
export function decideSnapshot(opts: {
  dragging: boolean;
  busy: boolean;
  incomingRevision: number;
  knownRevision: number;
  lastOpId: string | null;
  ownOpIds: ReadonlySet<string>;
}): SnapshotDecision {
  if (opts.lastOpId && opts.ownOpIds.has(opts.lastOpId)) return "echo";
  if (opts.incomingRevision === opts.knownRevision) return "ignore";
  if (opts.dragging || opts.busy) return "hold";
  return "apply";
}
