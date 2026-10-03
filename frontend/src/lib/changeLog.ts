// Histórico em texto do roteiro. A frase fica no i18n; aqui só o rótulo.
// Mesmos kind de describe_change no backend (day_title, não dayTitle).
// ponytail: teto 40 no doc. Upgrade = subcoleção, que passa a custar read.

import type { ActivityResponse, ItineraryResponse } from "@/lib/api";

export const CHANGE_LOG_CAP = 40;
const WINDOW_MS = 120_000;

export type ChangeEntry = {
  by: string;
  kind: string;
  day: number | null;
  at_ms: number;
};

export type LocalChange = {
  kind: string;
  day: number | null;
};

export function parseChangeLog(value: unknown): ChangeEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ChangeEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const kind = typeof raw.kind === "string" ? raw.kind.trim().slice(0, 32) : "";
    if (!kind) continue;
    const by = typeof raw.by === "string" ? raw.by.trim().slice(0, 80) : "";
    const day =
      typeof raw.day === "number" && Number.isFinite(raw.day) && raw.day >= 1
        ? raw.day
        : null;
    const at_ms =
      typeof raw.at_ms === "number" && Number.isFinite(raw.at_ms) ? raw.at_ms : 0;
    out.push({ by, kind, day, at_ms });
  }
  return out.slice(-CHANGE_LOG_CAP);
}

export function appendChangeLog(
  log: ChangeEntry[],
  entry: ChangeEntry,
): ChangeEntry[] {
  const kind = entry.kind.trim().slice(0, 32);
  if (!kind) return log.slice(-CHANGE_LOG_CAP);
  const by = entry.by.trim().slice(0, 80);
  const day =
    typeof entry.day === "number" && entry.day >= 1 ? entry.day : null;
  const at_ms = entry.at_ms;
  const next = log.slice(-CHANGE_LOG_CAP);
  const last = next[next.length - 1];
  if (
    last &&
    last.kind === kind &&
    last.day === day &&
    last.by === by &&
    at_ms >= last.at_ms &&
    at_ms - last.at_ms < WINDOW_MS
  ) {
    next[next.length - 1] = { by, kind, day, at_ms };
    return next;
  }
  next.push({ by, kind, day, at_ms });
  return next.slice(-CHANGE_LOG_CAP);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function actId(activity: ActivityResponse, index: number): string {
  const id = typeof activity.id === "string" ? activity.id.trim() : "";
  return id || `idx:${index}:${activity.time}:${activity.title}`;
}

function activitySig(activity: ActivityResponse): string {
  return [
    activity.time,
    activity.title,
    activity.description,
    activity.location,
    activity.latitude ?? "",
    activity.longitude ?? "",
    activity.requires_ticket ? 1 : 0,
    activity.completed ? 1 : 0,
    activity.place_id ?? "",
  ].join("\u0001");
}

/** O que mudou entre dois roteiros já normalizados pra gravar. Vazio = não loga. */
export function describeLocalChanges(
  before: ItineraryResponse,
  after: ItineraryResponse,
): LocalChange[] {
  const out: LocalChange[] = [];
  const push = (kind: string, day: number | null = null) => {
    out.push({ kind, day });
  };

  if (text(before.title) !== text(after.title)) push("title");
  if (text(before.notes) !== text(after.notes)) push("notes");
  if (text(before.summary) !== text(after.summary)) push("summary");

  const beforeDays = new Map(before.days.map((day) => [day.day, day]));
  const afterDays = new Map(after.days.map((day) => [day.day, day]));
  const numbers = [...new Set([...beforeDays.keys(), ...afterDays.keys()])].sort(
    (a, b) => a - b,
  );
  let removed = false;
  let patched = false;

  for (const number of numbers) {
    const prev = beforeDays.get(number);
    const next = afterDays.get(number);
    if (!prev && next) {
      push("add_day", number);
      continue;
    }
    if (prev && !next) {
      push("delete_day", number);
      continue;
    }
    if (!prev || !next) continue;
    if (text(prev.title) !== text(next.title)) push("day_title", number);

    const prevIds = prev.activities.map(actId);
    const nextIds = next.activities.map(actId);
    const prevSet = new Set(prevIds);
    const nextSet = new Set(nextIds);
    if (nextIds.some((id) => !prevSet.has(id))) push("add_activity", number);
    if (prevIds.some((id) => !nextSet.has(id))) removed = true;

    const prevCommon = prevIds.filter((id) => nextSet.has(id));
    const nextCommon = nextIds.filter((id) => prevSet.has(id));
    if (prevCommon.join("\u0001") !== nextCommon.join("\u0001")) {
      push("reorder", number);
    }

    const prevById = new Map(
      prev.activities.map((activity, index) => [actId(activity, index), activity]),
    );
    if (!patched) {
      for (let index = 0; index < next.activities.length; index += 1) {
        const activity = next.activities[index];
        if (!activity) continue;
        const id = actId(activity, index);
        if (!prevSet.has(id)) continue;
        const old = prevById.get(id);
        if (old && activitySig(old) !== activitySig(activity)) {
          patched = true;
          break;
        }
      }
    }
  }

  if (removed) push("delete_activity");
  if (patched) push("patch_activity");

  const tips = (items: string[] | undefined) =>
    (items ?? []).map((item) => item.trim()).filter(Boolean).join("\u0001");
  const meta =
    text(before.destination) !== text(after.destination) ||
    (before.start_date ?? "") !== (after.start_date ?? "") ||
    (before.end_date ?? "") !== (after.end_date ?? "") ||
    tips(before.tips) !== tips(after.tips);
  if (meta) push("meta");

  return out;
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  const once = appendChangeLog([], {
    by: "Ana",
    kind: "notes",
    day: null,
    at_ms: 1_000,
  });
  const again = appendChangeLog(once, {
    by: "Ana",
    kind: "notes",
    day: null,
    at_ms: 2_000,
  });
  console.assert(
    again.length === 1 && again[0]?.at_ms === 2_000,
    "[changeLog] repetição em 2 min só atualiza a hora",
  );
}
