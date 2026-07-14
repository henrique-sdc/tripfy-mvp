// Persistência de roteiros do usuário em users/{uid}/trips/{tripId}.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import type { ItineraryResponse } from "@/lib/api";
import { auth, db } from "@/lib/firebase";

export type SavedTrip = ItineraryResponse & {
  id: string;
  created_at?: unknown;
  updated_at?: unknown;
};

/** Remove campos só-de-UI antes de gravar no Firestore. */
export function stripClientKeys(itinerary: ItineraryResponse): ItineraryResponse {
  return {
    destination: itinerary.destination,
    summary: itinerary.summary,
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
      updated_at: serverTimestamp(),
      ...(isNew ? { created_at: serverTimestamp() } : {}),
    },
    { merge: true },
  );

  return ref.id;
}

export async function deleteTrip(tripId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado.");
  await deleteDoc(doc(db, "users", uid, "trips", tripId));
}

/** Lista roteiros do usuário (mais recentes primeiro). */
export async function listTrips(): Promise<SavedTrip[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(
    collection(db, "users", uid, "trips"),
    orderBy("updated_at", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      destination: String(data.destination ?? ""),
      summary: String(data.summary ?? ""),
      days: Array.isArray(data.days) ? data.days : [],
      created_at: data.created_at,
      updated_at: data.updated_at,
    } as SavedTrip;
  });
}

export async function getTrip(tripId: string): Promise<SavedTrip | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid, "trips", tripId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    destination: String(data.destination ?? ""),
    summary: String(data.summary ?? ""),
    days: Array.isArray(data.days) ? data.days : [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
