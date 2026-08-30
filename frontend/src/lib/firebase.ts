// Inicialização do Firebase JS SDK para o app Expo.
// Usa apenas variáveis EXPO_PUBLIC_* — nunca chaves privadas no frontend.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
// @ts-ignore: getReactNativePersistence existe no bundle React Native do
// Firebase v12, mas está ausente das definições de tipo públicas (web).
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createAuth() {
  // No bundle web/SSR essa função não existe — chamar explode o Metro
  // (`getReactNativePersistence is not a function`). No nativo é o que
  // persiste a sessão no AsyncStorage (sem isso, relogin a cada abertura).
  if (typeof getReactNativePersistence !== "function") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast Refresh reexecuta o módulo; initializeAuth só roda uma vez por app.
    return getAuth(app);
  }
}

export const auth = createAuth();

// Exporta cada serviço — importe onde precisar, não o `app` em si.
export const db = getFirestore(app);
export const storage = getStorage(app);
