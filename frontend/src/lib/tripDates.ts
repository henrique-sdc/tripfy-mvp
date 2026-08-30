// Datas de viagem (calendário do wizard) — dias inclusivos, máx. 15.

export const MIN_TRIP_DAYS = 1;
export const MAX_TRIP_DAYS = 15;

/** Zera hora local — evita drift de timezone no DateTimePicker. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addLocalDays(d: Date, n: number): Date {
  const next = startOfLocalDay(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Contagem inclusiva: 1 jul → 15 jul = 15. */
export function inclusiveDayCount(start: Date, end: Date): number {
  const a = startOfLocalDay(start).getTime();
  const b = startOfLocalDay(end).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function toIsoDate(d: Date): string {
  const x = startOfLocalDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function clampEndToMaxSpan(start: Date, end: Date): Date {
  const maxEnd = addLocalDays(start, MAX_TRIP_DAYS - 1);
  const e = startOfLocalDay(end);
  const s = startOfLocalDay(start);
  if (e.getTime() < s.getTime()) return s;
  if (e.getTime() > maxEnd.getTime()) return maxEnd;
  return e;
}

/** Ex.: "1 de jul. – 15 de jul." */
export function formatTripDateSpan(
  startIso: string,
  endIso: string,
  locale = "pt-BR",
): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return "";
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/** Ex.: "1 de jul. – 15 de jul. · 15" (lobby / resumos). */
export function formatTripDateRangeLabel(
  startIso: string,
  endIso: string,
  days: number,
  locale = "pt-BR",
): string {
  const span = formatTripDateSpan(startIso, endIso, locale);
  if (!span) return "";
  return `${span} · ${days}`;
}
