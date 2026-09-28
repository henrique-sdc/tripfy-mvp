// Pernas de deslocamento — puro, sem rede.
// A chave arredonda a 5 casas (~1 m), igual ao cache do backend.

export type TravelMode = "walking" | "public_transit" | "ride_hail";

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type RouteLeg = {
  distance_meters: number;
  duration_seconds: number;
};

export type RouteGap = {
  key: string;
  afterIndex: number;
  from: LatLng;
  to: LatLng;
};

const PRIORITY: TravelMode[] = ["walking", "public_transit", "ride_hail"];

type Stop = {
  latitude?: number | null;
  longitude?: number | null;
  dayNumber?: number;
};

/** Um modo só: esse. Vários: a pé, depois transporte, depois carro. Vazio: a pé. */
export function primaryTransportMode(
  modes: string[] | null | undefined,
): TravelMode {
  for (const mode of PRIORITY) {
    if (modes?.includes(mode)) return mode;
  }
  return "walking";
}

export function routeLegKey(mode: string, from: LatLng, to: LatLng): string {
  return (
    `${mode}|${from.latitude.toFixed(5)}|${from.longitude.toFixed(5)}` +
    `|${to.latitude.toFixed(5)}|${to.longitude.toFixed(5)}`
  );
}

export function haversineMeters(from: LatLng, to: LatLng): number {
  const radius = 6_371_000;
  const phi1 = (from.latitude * Math.PI) / 180;
  const phi2 = (to.latitude * Math.PI) / 180;
  const dPhi = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLmb = ((to.longitude - from.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLmb / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function coordsOf(stop: Stop): LatLng | null {
  if (
    typeof stop.latitude !== "number" ||
    typeof stop.longitude !== "number" ||
    !Number.isFinite(stop.latitude) ||
    !Number.isFinite(stop.longitude)
  ) {
    return null;
  }
  return { latitude: stop.latitude, longitude: stop.longitude };
}

/** Só pares vizinhos com coordenada. Buraco no meio não vira atalho A→C. */
export function routeGaps(activities: Stop[], mode: string): RouteGap[] {
  const gaps: RouteGap[] = [];
  for (let index = 0; index < activities.length - 1; index++) {
    const fromDay = activities[index].dayNumber;
    const toDay = activities[index + 1].dayNumber;
    if (fromDay != null && toDay != null && fromDay !== toDay) continue;
    const from = coordsOf(activities[index]);
    const to = coordsOf(activities[index + 1]);
    if (!from || !to) continue;
    gaps.push({
      key: routeLegKey(mode, from, to),
      afterIndex: index,
      from,
      to,
    });
  }
  return gaps;
}

/** Misses consecutivos viram uma cadeia. O resto fica em chamadas separadas. */
export function groupMissRuns(
  misses: RouteGap[],
): { gaps: RouteGap[]; stops: LatLng[] }[] {
  const sorted = [...misses].sort((a, b) => a.afterIndex - b.afterIndex);
  const runs: { gaps: RouteGap[]; stops: LatLng[] }[] = [];
  for (const gap of sorted) {
    const last = runs[runs.length - 1];
    const prev = last?.gaps[last.gaps.length - 1];
    if (last && prev && prev.afterIndex + 1 === gap.afterIndex) {
      last.gaps.push(gap);
      last.stops.push(gap.to);
    } else {
      runs.push({ gaps: [gap], stops: [gap.from, gap.to] });
    }
  }
  return runs.flatMap(splitRun);
}

/** A rota aceita no máximo 8 pontos. Um dia cheio vira mais de um POST. */
function splitRun(run: {
  gaps: RouteGap[];
  stops: LatLng[];
}): { gaps: RouteGap[]; stops: LatLng[] }[] {
  const maxGaps = 7;
  if (run.gaps.length <= maxGaps) return [run];
  const chunks: { gaps: RouteGap[]; stops: LatLng[] }[] = [];
  for (let index = 0; index < run.gaps.length; index += maxGaps) {
    const gaps = run.gaps.slice(index, index + maxGaps);
    chunks.push({
      gaps,
      stops: [gaps[0].from, ...gaps.map((gap) => gap.to)],
    });
  }
  return chunks;
}

export function lastWithCoords(activities: Stop[]): LatLng | null {
  for (let index = activities.length - 1; index >= 0; index--) {
    const coords = coordsOf(activities[index]);
    if (coords) return coords;
  }
  return null;
}

/** Chave i18n + valores. O texto mora no pt-BR.json. */
export function routeDurationParts(seconds: number): {
  key: string;
  values: Record<string, number>;
} {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return { key: "tripDetail.route.min", values: { count: minutes } };
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) {
    return { key: "tripDetail.route.hour", values: { hours } };
  }
  return { key: "tripDetail.route.hourMin", values: { hours, minutes: rem } };
}

export function routeDistanceParts(meters: number): {
  key: string;
  values: Record<string, string | number>;
} {
  if (meters < 1000) {
    return {
      key: "tripDetail.route.meters",
      values: { count: Math.max(0, Math.round(meters)) },
    };
  }
  const distance = (meters / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return { key: "tripDetail.route.km", values: { distance } };
}
