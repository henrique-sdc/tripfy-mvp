// Store do sheet "criar roteiro" — botão mágico da tab bar abre de qualquer tela.

import { create } from "zustand";

type CreateTripSheetState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useCreateTripSheetStore = create<CreateTripSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
