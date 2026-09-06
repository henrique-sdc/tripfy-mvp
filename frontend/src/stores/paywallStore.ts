// Overlay do paywall — aberto pelo interceptor 402 ou pela UI (Settings / FAB).

import { create } from "zustand";

export type PaywallReason = "active_trip_limit" | "manage";

type PaywallState = {
  visible: boolean;
  reason: PaywallReason;
  open: (reason?: PaywallReason) => void;
  close: () => void;
};

export const usePaywallStore = create<PaywallState>((set) => ({
  visible: false,
  reason: "manage",
  open: (reason = "manage") => set({ visible: true, reason }),
  close: () => set({ visible: false }),
}));
