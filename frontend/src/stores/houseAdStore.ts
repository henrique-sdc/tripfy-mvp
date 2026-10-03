// Pedido do interstitial. O detalhe pede ao sair; o root desenha.
// Se já está na tela, ignora — não empilha um Modal em cima do outro.

import { create } from "zustand";

import { noteHouseAdRequested, type HouseAdCreative } from "@/lib/houseAds";

type HouseAdState = {
  visible: boolean;
  creative: HouseAdCreative | null;
  request: (creative: HouseAdCreative) => void;
  close: () => void;
};

export const useHouseAdStore = create<HouseAdState>((set, get) => ({
  visible: false,
  creative: null,
  request: (creative) => {
    if (get().visible) return;
    noteHouseAdRequested();
    set({ visible: true, creative });
  },
  close: () => set({ visible: false, creative: null }),
}));
