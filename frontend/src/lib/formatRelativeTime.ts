// Tempo relativo nativo (sem date-fns) — Firestore Timestamp, Date ou ISO.

type EpochLike = {
  toDate?: () => Date;
  seconds?: number;
  _seconds?: number;
};

/** Converte Timestamp Firestore / Date / ISO em ms epoch. */
export function toEpochMs(value: unknown): number | null {
  if (value == null) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") {
    // Firestore às vezes manda seconds; ISO ms é > 1e12.
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "object") {
    const ts = value as EpochLike;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds = ts.seconds ?? ts._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return null;
}

export type RelativeTimeParts =
  | { key: "trips.relative.today" }
  | { key: "trips.relative.hours"; count: number }
  | { key: "trips.relative.days"; count: number }
  | { key: "trips.relative.weeks"; count: number };

/**
 * Partes i18n a partir de created_at/updated_at.
 * <1h → hoje; <24h → horas; <7d → dias; senão semanas.
 */
export function relativeTimeParts(
  value: unknown,
  nowMs = Date.now(),
): RelativeTimeParts | null {
  const ms = toEpochMs(value);
  if (ms == null) return null;

  const diff = Math.max(0, nowMs - ms);
  const hours = Math.floor(diff / 3_600_000);

  if (hours < 1) return { key: "trips.relative.today" };
  if (hours < 24) return { key: "trips.relative.hours", count: hours };

  const days = Math.floor(hours / 24);
  if (days < 7) return { key: "trips.relative.days", count: days };

  const weeks = Math.max(1, Math.floor(days / 7));
  return { key: "trips.relative.weeks", count: weeks };
}

/** Data curta pt-BR pra cards de review (ex.: 21 de jul. de 2026). */
export function formatShortDate(
  value: unknown,
  locale = "pt-BR",
): string | null {
  const ms = toEpochMs(value);
  if (ms == null) return null;
  return new Date(ms).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Review foi editada se o backend gravou updated_at (null no create). */
export function isReviewEdited(updatedAt: unknown): boolean {
  return updatedAt != null && String(updatedAt).trim().length > 0;
}

// Self-check mínimo — quebra em dev se a faixa horária mudar sem querer.
if (typeof __DEV__ !== "undefined" && __DEV__) {
  const now = Date.parse("2026-07-21T12:00:00.000Z");
  const hours = relativeTimeParts(new Date(now - 3 * 3_600_000), now);
  console.assert(
    hours?.key === "trips.relative.hours" &&
      hours != null &&
      "count" in hours &&
      hours.count === 3,
    "[formatRelativeTime] esperado Há 3 h",
  );
  const today = relativeTimeParts(new Date(now - 10 * 60_000), now);
  console.assert(
    today?.key === "trips.relative.today",
    "[formatRelativeTime] esperado Hoje",
  );
}
