// Inicialização do Firebase JS SDK para o app Expo.
// Usa apenas variáveis EXPO_PUBLIC_* — nunca chaves privadas no frontend.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
// @ts-ignore: getReactNativePersistence existe no bundle React Native do
// Firebase v12, mas está ausente das definições de tipo públicas (web).
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
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

const app = initializeApp(firebaseConfig);

// initializeAuth com AsyncStorage é obrigatório no React Native: sem isso, o
// Firebase usa persistência em memória e a sessão é perdida a cada reabertura
// do app. É o que garante "app reaberto com sessão ativa → home direto".
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Exporta cada serviço — importe onde precisar, não o `app` em si.
export const db = getFirestore(app);
export const storage = getStorage(app);
