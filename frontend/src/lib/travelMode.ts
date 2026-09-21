// Helpers do Modo Viagem — trava de review e default Planejar/Viajar.

import { isOnOrAfterTripStart } from "@/lib/tripDates";

export type TripChromeMode = "plan" | "travel";

type ActivityVisit = {
  completed?: boolean;
  place_id?: string | null;
};

type DayVisit = { activities: ActivityVisit[] };

/** True se alguma parada feita deste roteiro aponta pro Google place_id. */
export function hasCompletedPlace(
  days: DayVisit[],
  placeId: string | null | undefined,
): boolean {
  const pid = placeId?.trim() ?? "";
  if (!pid) return false;
  return days.some((d) =>
    d.activities.some((a) => a.completed === true && a.place_id === pid),
  );
}

export function defaultChromeMode(startIso?: string | null): TripChromeMode {
  return isOnOrAfterTripStart(startIso) ? "travel" : "plan";
}
