// Lista de desejos (Salvos) — favoritos da Home caem aqui.
// Persistência Firestore fica para depois; AsyncStorage basta no MVP.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WishlistItem = {
  id: string;
  kind: "destination" | "itinerary";
  title: string;
  image: string;
  subtitle?: string;
};

type WishlistState = {
  items: WishlistItem[];
  toggle: (item: WishlistItem) => void;
  has: (id: string) => boolean;
  remove: (id: string) => void;
};

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      has: (id) => get().items.some((i) => i.id === id),
      toggle: (item) =>
        set((state) => {
          const exists = state.items.some((i) => i.id === item.id);
          return {
            items: exists
              ? state.items.filter((i) => i.id !== item.id)
              : [item, ...state.items],
          };
        }),
      remove: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),
    }),
    {
      name: "tripfy-wishlist",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
