// Preferências do aparelho (não da conta). Sobrevive a logout.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  applyThemeMode,
  sanitizeThemeMode,
  type ThemeMode,
} from "@/lib/appearance";
import { applyLocale, isAppLocale, type AppLocale } from "@/lib/i18n";

export type { ThemeMode };

type PreferencesState = {
  haptics: boolean;
  themeMode: ThemeMode;
  locale: AppLocale;
  hasHydrated: boolean;
  setHaptics: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  setLocale: (value: AppLocale) => void;
};

// Expo Router SSR (Node, platform=web) não tem window. AsyncStorage web
// usa localStorage; setItem sem catch derruba o Metro (nativo incluso).
const persistStorage =
  Platform.OS === "web" && typeof window === "undefined"
    ? {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
    : AsyncStorage;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      haptics: false,
      themeMode: "system",
      locale: "pt-BR",
      hasHydrated: false,
      setHaptics: (haptics) => set({ haptics }),
      setThemeMode: (value) => {
        const themeMode = sanitizeThemeMode(value);
        applyThemeMode(themeMode);
        set({ themeMode });
      },
      setLocale: (value) => {
        const locale: AppLocale = isAppLocale(value) ? value : "pt-BR";
        applyLocale(locale);
        set({ locale });
      },
    }),
    {
      name: "tripfy-preferences-v2",
      storage: createJSONStorage(() => persistStorage),
      partialize: (state) => ({
        haptics: state.haptics,
        themeMode: state.themeMode,
        locale: state.locale,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("[prefs] reidratar falhou:", error);
        }
        const themeMode = sanitizeThemeMode(state?.themeMode);
        const locale: AppLocale = isAppLocale(state?.locale ?? "")
          ? state!.locale
          : "pt-BR";
        applyThemeMode(themeMode);
        applyLocale(locale);
        // Sempre marca hidratado — senão a splash nativa nunca some.
        usePreferencesStore.setState({ hasHydrated: true, themeMode, locale });
      },
    },
  ),
);
