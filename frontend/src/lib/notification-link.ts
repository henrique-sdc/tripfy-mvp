// Path de Expo Router vindo do push. Sem scheme: `tripfy://trip-detail`
// faz o Expo tratar "trip-detail" como host.

const TRIP = "/trip-detail?";

export function notificationHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return null;
  }
  if (raw === "/help-support" || raw.startsWith("/help-support?")) {
    return "/help-support";
  }
  if (!raw.startsWith(TRIP) || raw.includes("#") || raw.includes("\\")) {
    return null;
  }
  const tripId = new URLSearchParams(raw.slice(TRIP.length)).get("tripId");
  if (!tripId?.trim()) return null;
  return raw;
}
