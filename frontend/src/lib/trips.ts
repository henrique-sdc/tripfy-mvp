// Persistência de roteiros do usuário em users/{uid}/trips/{tripId}.
// Soft delete: deleted_at. Índice trip_shares/{id} pra deep link/clone (RF09).

import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import type { ItineraryResponse } from "@/lib/api";
import { createTripApi, restoreTripApi } from "@/lib/api";
import { auth, db } from "@/lib/firebase";
import { optionalIsoDate } from "@/lib/tripDates";

export type SavedTrip = ItineraryResponse & {
  id: string;
  owner_uid?: string;
  /** Presente se o roteiro nasceu de uma sessão de Match (RF11/RF12). */
  match_id?: string;
  deleted_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function optionalMatchId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id || undefined;
}

/** Remove campos só-de-UI antes de gravar no Firestore. */
export function stripClientKeys(itinerary: ItineraryResponse): ItineraryResponse {
  const title =
    typeof itinerary.title === "string" ? itinerary.title.trim() : "";
  const start_date = optionalIsoDate(itinerary.start_date);
  const end_date = optionalIsoDate(itinerary.end_date);
  return {
    destination: itinerary.destination,
    title,
    summary: itinerary.summary,
    tips: Array.isArray(itinerary.tips)
      ? itinerary.tips.map((t) => String(t).trim()).filter(Boolean)
      : [],
    notes: typeof itinerary.notes === "string" ? itinerary.notes.trim() : "",
    days: itinerary.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map((a) => ({
        time: a.time,
        title: a.title,
        description: a.description,
        location: a.location,
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
        requires_ticket: Boolean(a.requires_ticket),
      })),
    })),
    ...(start_date ? { start_date } : {}),
    ...(end_date ? { end_date } : {}),
  };
}

/** Cria (via API, com teto Free) ou atualiza um roteiro; retorna o tripId. */
export async function saveTrip(
  itinerary: ItineraryResponse,
  tripId?: string,
  opts?: { matchId?: string },
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");

  const matchId = optionalMatchId(opts?.matchId);
  const cleaned = stripClientKeys(itinerary);

  // Create só no FastAPI — rules bloqueiam create no client (limite Free).
  if (!tripId) {
    const created = await createTripApi(
      cleaned,
      matchId ? { matchId } : undefined,
    );
    return created.id;
  }

  const ref = doc(db, "users", uid, "trips", tripId);
  await setDoc(
    ref,
    {
      ...cleaned,
      owner_uid: uid,
      trip_id: ref.id,
      updated_at: serverTimestamp(),
      ...(matchId ? { match_id: matchId } : {}),
    },
    { merge: true },
  );

  await setDoc(
    doc(db, "trip_shares", ref.id),
    { owner_uid: uid, trip_id: ref.id },
    { merge: true },
  );

  return ref.id;
}

/** Soft delete — 30 dias na lixeira (não apaga o doc). */
export async function softDeleteTrip(tripId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");
  await updateDoc(doc(db, "users", uid, "trips", tripId), {
    deleted_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

/** @deprecated use softDeleteTrip — mantido pra imports antigos. */
export async function deleteTrip(tripId: string): Promise<void> {
  return softDeleteTrip(tripId);
}

export async function restoreTripLocal(tripId: string): Promise<void> {
  // Restore zera deleted_at — tem que passar no teto Free (API, não client).
  await restoreTripApi(tripId);
}

/**
 * Apaga de vez — só se já estiver na lixeira (`deleted_at` set).
 * Também limpa o índice trip_shares.
 */
export async function purgeTrip(tripId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");

  const id = tripId.trim();
  if (!id) throw new Error("tripId inválido.");

  const ref = doc(db, "users", uid, "trips", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Viagem não encontrada.");
  if (snap.data()?.deleted_at == null) {
    throw new Error("Só dá pra apagar de vez itens da lixeira.");
  }

  await deleteDoc(ref);

  // Índice de share — best-effort (pode não existir).
  try {
    await deleteDoc(doc(db, "trip_shares", id));
  } catch (err) {
    console.warn("[trips] Falha ao limpar trip_shares:", err);
  }
}

/** Contagens do perfil — aggregation, sem baixar os docs. */
export async function countTripStats(): Promise<{
  total: number;
  matches: number;
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { total: 0, matches: 0 };

  const col = collection(db, "users", uid, "trips");
  // `!= ""` ignora docs sem o campo (solo / Match anterior ao metadado).
  const [allSnap, matchSnap] = await Promise.all([
    getCountFromServer(col),
    getCountFromServer(query(col, where("match_id", "!=", ""))).catch(
      (err) => {
        console.warn("[trips] Contagem de Matches falhou:", err);
        return null;
      },
    ),
  ]);
  return {
    total: allSnap.data().count,
    matches: matchSnap ? matchSnap.data().count : 0,
  };
}

/** Lista roteiros ativos (sem deleted_at). */
export async function listTrips(): Promise<SavedTrip[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(
    collection(db, "users", uid, "trips"),
    orderBy("updated_at", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        owner_uid: String(data.owner_uid ?? uid),
        destination: String(data.destination ?? ""),
        title:
          typeof data.title === "string" && data.title.trim()
            ? data.title.trim()
            : undefined,
        summary: String(data.summary ?? ""),
        tips: Array.isArray(data.tips)
          ? data.tips.map((x: unknown) => String(x)).filter(Boolean)
          : [],
        notes: typeof data.notes === "string" ? data.notes : "",
        days: Array.isArray(data.days) ? data.days : [],
        start_date: optionalIsoDate(data.start_date),
        end_date: optionalIsoDate(data.end_date),
        match_id: optionalMatchId(data.match_id),
        deleted_at: data.deleted_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
      } as SavedTrip;
    })
    .filter((t) => t.deleted_at == null);
}

/** Último roteiro por updated_at — Home (card em destaque). */
export async function getLatestTrip(): Promise<SavedTrip | null> {
  const trips = await listTrips();
  return trips[0] ?? null;
}

export async function getTrip(tripId: string): Promise<SavedTrip | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid, "trips", tripId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.deleted_at != null) return null;
  return {
    id: snap.id,
    owner_uid: String(data.owner_uid ?? uid),
    destination: String(data.destination ?? ""),
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : undefined,
    summary: String(data.summary ?? ""),
    tips: Array.isArray(data.tips)
      ? data.tips.map((x: unknown) => String(x)).filter(Boolean)
      : [],
    notes: typeof data.notes === "string" ? data.notes : "",
    days: Array.isArray(data.days) ? data.days : [],
    start_date: optionalIsoDate(data.start_date),
    end_date: optionalIsoDate(data.end_date),
    match_id: optionalMatchId(data.match_id),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
