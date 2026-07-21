// Persistência de roteiros do usuário em users/{uid}/trips/{tripId}.
// Soft delete: deleted_at. Índice trip_shares/{id} pra deep link/clone (RF09).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import type { ItineraryResponse } from "@/lib/api";
import { auth, db } from "@/lib/firebase";

export type SavedTrip = ItineraryResponse & {
  id: string;
  owner_uid?: string;
  deleted_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

/** Remove campos só-de-UI antes de gravar no Firestore. */
export function stripClientKeys(itinerary: ItineraryResponse): ItineraryResponse {
  return {
    destination: itinerary.destination,
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
      })),
    })),
  };
}

/** Cria ou atualiza um roteiro; retorna o tripId. */
export async function saveTrip(
  itinerary: ItineraryResponse,
  tripId?: string,
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");

  const ref = tripId
    ? doc(db, "users", uid, "trips", tripId)
    : doc(collection(db, "users", uid, "trips"));

  const isNew = !tripId;
  await setDoc(
    ref,
    {
      ...stripClientKeys(itinerary),
      owner_uid: uid,
      trip_id: ref.id,
      updated_at: serverTimestamp(),
      ...(isNew
        ? { created_at: serverTimestamp(), deleted_at: null }
        : {}),
    },
    { merge: true },
  );

  // Índice pra deep link / clone via Admin SDK (client não lê trip_shares).
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
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");
  await updateDoc(doc(db, "users", uid, "trips", tripId), {
    deleted_at: null,
    updated_at: serverTimestamp(),
  });
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
      summary: String(data.summary ?? ""),
      tips: Array.isArray(data.tips)
        ? data.tips.map((x: unknown) => String(x)).filter(Boolean)
        : [],
      notes: typeof data.notes === "string" ? data.notes : "",
      days: Array.isArray(data.days) ? data.days : [],
      deleted_at: data.deleted_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    } as SavedTrip;
    })
    .filter((t) => t.deleted_at == null);
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
    summary: String(data.summary ?? ""),
    tips: Array.isArray(data.tips)
      ? data.tips.map((x: unknown) => String(x)).filter(Boolean)
      : [],
    notes: typeof data.notes === "string" ? data.notes : "",
    days: Array.isArray(data.days) ? data.days : [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
