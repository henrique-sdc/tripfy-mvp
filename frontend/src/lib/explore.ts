// Feed Explorar — cartões em explore_trips, nunca o doc da viagem.
// Igualdade no destino: a mesma normalização do backend (strip, caixa, espaços).
// Prefixo ("lis" → Lisboa) fica de fora. Upgrade = índice externo.

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { utcWeekId } from "@/lib/utcWeek";

export const EXPLORE_PAGE = 20;
export const HOME_EXPLORE_PREVIEW = 8;
export const WEEKLY_TOP = 10;

export type ExploreSort = "recent" | "popular";

export type ExploreCard = {
  id: string;
  destination: string;
  title: string;
  summary: string;
  dayCount: number;
  ownerName: string;
  cloneCount: number;
};

export type ExplorePage = {
  cards: ExploreCard[];
  cursor: QueryDocumentSnapshot | null;
};

export function destinationKey(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

function cardFromDoc(id: string, data: Record<string, unknown>): ExploreCard {
  const days = data.day_count;
  const clones = data.clone_count;
  return {
    id,
    destination: typeof data.destination === "string" ? data.destination : "",
    title: typeof data.title === "string" ? data.title : "",
    summary: typeof data.summary === "string" ? data.summary : "",
    dayCount: typeof days === "number" && days > 0 ? days : 0,
    ownerName: typeof data.owner_name === "string" ? data.owner_name : "",
    cloneCount: typeof clones === "number" && clones > 0 ? clones : 0,
  };
}

export async function listExploreTrips(opts: {
  sort: ExploreSort;
  destinationKey?: string;
  cursor?: QueryDocumentSnapshot | null;
}): Promise<ExplorePage> {
  const key = opts.destinationKey?.trim();
  const constraints = [];
  if (key) {
    constraints.push(where("destination_key", "==", key));
    constraints.push(orderBy("published_at", "desc"));
  } else if (opts.sort === "popular") {
    constraints.push(where("week_id", "==", utcWeekId()));
    constraints.push(orderBy("week_saves", "desc"));
  } else {
    constraints.push(orderBy("published_at", "desc"));
  }
  constraints.push(limit(EXPLORE_PAGE));
  if (opts.cursor) constraints.push(startAfter(opts.cursor));

  const snap = await getDocs(
    query(collection(db, "explore_trips"), ...constraints),
  );
  const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return {
    cards: snap.docs.map((item) =>
      cardFromDoc(item.id, item.data() as Record<string, unknown>),
    ),
    cursor: snap.docs.length === EXPLORE_PAGE ? last : null,
  };
}

export async function listRecentExplore(max = HOME_EXPLORE_PREVIEW): Promise<ExploreCard[]> {
  const snap = await getDocs(
    query(
      collection(db, "explore_trips"),
      orderBy("published_at", "desc"),
      limit(max),
    ),
  );
  return snap.docs.map((item) =>
    cardFromDoc(item.id, item.data() as Record<string, unknown>),
  );
}

export async function listWeeklyTop(): Promise<ExploreCard[]> {
  const snap = await getDocs(
    query(
      collection(db, "explore_trips"),
      where("week_id", "==", utcWeekId()),
      orderBy("week_saves", "desc"),
      limit(WEEKLY_TOP),
    ),
  );
  return snap.docs.map((item) =>
    cardFromDoc(item.id, item.data() as Record<string, unknown>),
  );
}
