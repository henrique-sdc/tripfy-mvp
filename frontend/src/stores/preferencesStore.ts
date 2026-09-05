// Preferências do aparelho (não da conta). Sobrevive a logout — vibração é
// do dispositivo, não do usuário logado.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PreferencesState = {
  haptics: boolean;
  setHaptics: (value: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      haptics: false,
      setHaptics: (haptics) => set({ haptics }),
    }),
    {
      name: "tripfy-preferences-v2",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
