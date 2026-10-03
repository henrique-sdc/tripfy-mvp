// Pin Premium: cópia do roteiro + URLs de foto já resolvidas.
// Firestore JS não persiste no React Native (IndexedDB é web). O pin é
// o fallback quando o aparelho está sem rede — não um segundo banco.
// ponytail: URL do Google expira e o disco do expo-image é LRU. Se os
// dois acontecem, a capa some e o texto fica. Upgrade: arquivo estável
// no FileSystem, em vez da URI do Google como chave de cache.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  getPlaceDetails,
  peekPlaceDetails,
  placeDetailsCacheKey,
  type ItineraryResponse,
  type PlaceDetailsResponse,
} from "@/lib/api";
import { buildPlacesLookupQuery } from "@/lib/placeDisplay";

const LOOKUP_CONCURRENCY = 4;

export type OfflinePlaceEntry = {
  query: string;
  lat: number | null;
  lng: number | null;
  details: PlaceDetailsResponse;
};

export type OfflineTripMeta = {
  id: string;
  ownerUid?: string | null;
  matchId?: string | null;
  collab?: boolean;
  revision?: number;
  readOnly?: boolean;
};

export type OfflineTripSnapshot = ItineraryResponse & {
  id: string;
  owner_uid?: string;
  match_id?: string;
  collab?: boolean;
  revision?: number;
  read_only: boolean;
};

export type OfflineTripPin = {
  savedAt: number;
  trip: OfflineTripSnapshot;
  places: OfflinePlaceEntry[];
};

type OfflineTripsState = {
  pins: Record<string, OfflineTripPin>;
  hasHydrated: boolean;
  markHydrated: () => void;
  put: (pin: OfflineTripPin) => void;
  unpin: (id: string) => void;
  clear: () => void;
};

const persistStorage =
  Platform.OS === "web" && typeof window === "undefined"
    ? {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
    : AsyncStorage;

let epoch = 0;
const flight = new Map<string, number>();

function beginFlight(id: string): { epoch: number; gen: number } {
  const gen = (flight.get(id) ?? 0) + 1;
  flight.set(id, gen);
  return { epoch, gen };
}

function flightCurrent(id: string, token: { epoch: number; gen: number }): boolean {
  return epoch === token.epoch && flight.get(id) === token.gen;
}

function invalidateFlights() {
  epoch += 1;
  flight.clear();
}

export const useOfflineTripsStore = create<OfflineTripsState>()(
  persist(
    (set) => ({
      pins: {},
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),
      put: (pin) =>
        set((state) => ({
          pins: { ...state.pins, [pin.trip.id]: pin },
        })),
      unpin: (id) => {
        beginFlight(id);
        set((state) => {
          if (!state.pins[id]) return state;
          const pins = { ...state.pins };
          delete pins[id];
          return { pins };
        });
      },
      clear: () => {
        invalidateFlights();
        set({ pins: {} });
      },
    }),
    {
      name: "tripfy-offline-trips",
      storage: createJSONStorage(() => persistStorage),
      partialize: (state) => ({ pins: state.pins }),
      onRehydrateStorage: () => (_state, err) => {
        if (err) console.warn("[offline] reidratar pin:", err);
        useOfflineTripsStore.getState().markHydrated();
      },
    },
  ),
);

export function clearOfflinePins() {
  useOfflineTripsStore.getState().clear();
}

export function buildOfflineSnapshot(
  itinerary: ItineraryResponse,
  meta: OfflineTripMeta,
): OfflineTripSnapshot {
  const match = meta.matchId?.trim() || undefined;
  const owner = meta.ownerUid?.trim() || undefined;
  return {
    destination: itinerary.destination,
    title: itinerary.title,
    summary: itinerary.summary,
    tips: itinerary.tips,
    local_life: itinerary.local_life,
    notes: itinerary.notes,
    days: itinerary.days,
    start_date: itinerary.start_date,
    end_date: itinerary.end_date,
    id: meta.id,
    owner_uid: owner,
    match_id: match,
    collab: Boolean(meta.collab),
    revision: meta.revision ?? 0,
    read_only: Boolean(meta.readOnly),
  };
}

function coordPair(
  lat?: number | null,
  lng?: number | null,
): { lat: number | null; lng: number | null } {
  const ok =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  return ok ? { lat, lng } : { lat: null, lng: null };
}

function pinSignature(trip: OfflineTripSnapshot, places: OfflinePlaceEntry[]): string {
  return JSON.stringify({
    trip,
    places: places.map((entry) => [
      placeDetailsCacheKey(entry.query, entry.lat, entry.lng),
      entry.details.photo_url,
    ]),
  });
}

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

async function resolvePlaces(
  itinerary: ItineraryResponse,
  previous: OfflinePlaceEntry[],
): Promise<{ places: OfflinePlaceEntry[]; freshUrls: string[] }> {
  const prev = new Map(
    previous.map((entry) => [
      placeDetailsCacheKey(entry.query, entry.lat, entry.lng),
      entry.details,
    ]),
  );
  const jobs: {
    query: string;
    lat: number | null;
    lng: number | null;
    known: PlaceDetailsResponse | null;
  }[] = [];
  const seen = new Set<string>();

  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      const query = buildPlacesLookupQuery(activity.title, activity.location);
      if (query.length < 2) continue;
      const coords = coordPair(activity.latitude, activity.longitude);
      const key = placeDetailsCacheKey(query, coords.lat, coords.lng);
      if (seen.has(key)) continue;
      seen.add(key);
      const known = prev.get(key) ?? peekPlaceDetails(query, coords.lat, coords.lng) ?? null;
      jobs.push({ query, ...coords, known });
    }
  }

  const freshUrls: string[] = [];
  const resolved = await mapLimited(jobs, LOOKUP_CONCURRENCY, async (job) => {
    if (job.known) {
      return {
        query: job.query,
        lat: job.lat,
        lng: job.lng,
        details: job.known,
      };
    }
    try {
      const details = await getPlaceDetails(job.query, job.lat, job.lng);
      const url = details.photo_url;
      if (url && url.startsWith("http")) freshUrls.push(url);
      return { query: job.query, lat: job.lat, lng: job.lng, details };
    } catch (err) {
      console.warn("[offline] lookup da parada falhou:", err);
      return null;
    }
  });

  return {
    places: resolved.filter((entry): entry is OfflinePlaceEntry => entry != null),
    freshUrls,
  };
}

async function prefetchPlacePhotos(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter((url) => url.startsWith("http")))];
  if (unique.length === 0) return;
  try {
    const ok = await Image.prefetch(unique, "disk");
    if (!ok) console.warn("[offline] prefetch incompleto");
  } catch (err) {
    console.warn("[offline] prefetch de fotos falhou:", err);
  }
}

export type PinWriteStatus = "saved" | "cancelled";

async function writePin(
  itinerary: ItineraryResponse,
  meta: OfflineTripMeta,
  prefetchAll: boolean,
): Promise<PinWriteStatus> {
  const id = meta.id.trim();
  if (!id) return "cancelled";
  const token = beginFlight(id);
  const previous = prefetchAll
    ? []
    : (useOfflineTripsStore.getState().pins[id]?.places ?? []);
  const { places, freshUrls } = await resolvePlaces(itinerary, previous);
  // Logout, "excluir todos" ou um unpin desta viagem invalidam o token.
  // Não grava por cima e não finge sucesso.
  if (!flightCurrent(id, token)) return "cancelled";
  if (!prefetchAll && !useOfflineTripsStore.getState().pins[id]) return "cancelled";

  const trip = buildOfflineSnapshot(itinerary, { ...meta, id });
  const current = useOfflineTripsStore.getState().pins[id];
  const nextSig = pinSignature(trip, places);
  const same =
    current != null && pinSignature(current.trip, current.places) === nextSig;
  if (!same) {
    useOfflineTripsStore.getState().put({
      savedAt: Date.now(),
      trip,
      places,
    });
    console.info(`[offline] pin atualizado tripId=${id} paradas=${places.length}`);
  }

  const urls = prefetchAll
    ? places.flatMap((entry) =>
        entry.details.photo_url ? [entry.details.photo_url] : [],
      )
    : freshUrls;
  await prefetchPlacePhotos(urls);
  if (!flightCurrent(id, token)) return "cancelled";
  return "saved";
}

export function downloadTripOffline(
  itinerary: ItineraryResponse,
  meta: OfflineTripMeta,
): Promise<PinWriteStatus> {
  return writePin(itinerary, meta, true);
}

export function refreshPinnedTrip(
  itinerary: ItineraryResponse,
  meta: OfflineTripMeta,
): Promise<PinWriteStatus> {
  if (!useOfflineTripsStore.getState().pins[meta.id]) return Promise.resolve("cancelled");
  return writePin(itinerary, meta, false);
}
