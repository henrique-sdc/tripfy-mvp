// Perfil do usuário — RF03 / LGPD (RN01).
// Isola Auth + Firestore do UI. Foto vem da galeria como base64 (quality 0.5);
// no Auth só atualizamos displayName — photoURL não aguenta data URI grande.
//
// ponytail: photoBase64 no doc Firestore (teto ~1 MiB/doc). Com quality 0.5
// e crop 1:1 cabe; upgrade natural = Firebase Storage + photoURL.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { deleteUser, updateProfile } from "firebase/auth";

import type { TravelPreferences } from "@/lib/api";
import { auth, db } from "@/lib/firebase";

/** Teto defensivo — Firestore rejeita docs > 1 MiB; margem pra demais campos. */
const MAX_PHOTO_BASE64_CHARS = 700_000;

export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  bio: string;
  /** JPEG/PNG em base64 puro (sem prefixo data:). null = sem foto custom. */
  photoBase64: string | null;
  travel_preferences: TravelPreferences | null;
};

function stripDataUrlPrefix(raw: string): string {
  return raw.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
}

/** URI pronta pro <Image> — Auth photoURL OU data URI do Firestore. */
export function profilePhotoUri(
  profile: Pick<UserProfile, "photoBase64"> | null,
  authPhotoURL?: string | null,
): string | null {
  if (profile?.photoBase64) {
    return `data:image/jpeg;base64,${profile.photoBase64}`;
  }
  return authPhotoURL?.trim() || null;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};

  const prefs = data.travel_preferences;
  return {
    uid: user.uid,
    email: user.email ?? String(data.email ?? ""),
    name:
      String(data.name ?? "").trim() ||
      user.displayName?.trim() ||
      "",
    bio: String(data.bio ?? ""),
    photoBase64:
      typeof data.photoBase64 === "string" && data.photoBase64.length > 0
        ? data.photoBase64
        : null,
    travel_preferences:
      prefs && typeof prefs === "object"
        ? (prefs as TravelPreferences)
        : null,
  };
}

/**
 * Atualiza Auth (displayName) + merge no Firestore (name, bio, photoBase64).
 * `photoBase64` omitido/undefined = mantém a foto; `null` = remove.
 */
export async function updateUserProfile(
  name: string,
  bio: string,
  photoBase64?: string | null,
): Promise<UserProfile> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    throw new Error("Nome inválido.");
  }
  const trimmedBio = bio.trim().slice(0, 140);

  let nextPhoto: string | null | undefined = photoBase64;
  if (typeof nextPhoto === "string") {
    nextPhoto = stripDataUrlPrefix(nextPhoto);
    if (nextPhoto.length > MAX_PHOTO_BASE64_CHARS) {
      throw new Error("Foto muito grande. Escolha outra imagem.");
    }
  }

  await updateProfile(user, { displayName: trimmedName });

  const payload: Record<string, unknown> = {
    name: trimmedName,
    bio: trimmedBio,
    updated_at: serverTimestamp(),
  };
  if (nextPhoto !== undefined) {
    payload.photoBase64 = nextPhoto;
  }

  await setDoc(doc(db, "users", user.uid), payload, { merge: true });

  await user.reload();

  const profile = await getUserProfile();
  if (!profile) throw new Error("Falha ao reler o perfil.");
  return profile;
}

/** Apaga subcoleção trips → doc users/{uid} → Auth (LGPD / RF03). */
export async function deleteUserAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");
  const uid = user.uid;

  const tripsSnap = await getDocs(collection(db, "users", uid, "trips"));
  await Promise.all(tripsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(db, "users", uid));

  // Pode falhar com auth/requires-recent-login — a UI pede reauth.
  await deleteUser(user);
}
