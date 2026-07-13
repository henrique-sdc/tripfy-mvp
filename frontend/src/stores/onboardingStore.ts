// Store persistida (Zustand + AsyncStorage) que lembra se o usuário já viu
// o carrossel de slides de apresentação (Tela 1). É separada da authStore
// porque sobrevive a logout/login — o carrossel só deve aparecer uma vez
// por instalação do app, independente de quantas contas o usuário use.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type OnboardingSlidesState = {
  hasSeenSlides: boolean;
  // true depois que o AsyncStorage terminou de reidratar o estado — o
  // layout raiz espera isso antes de decidir qual grupo de rotas mostrar,
  // senão o carrossel "pisca" na tela mesmo pra quem já passou por ele.
  hasHydrated: boolean;
  markSlidesSeen: () => void;
  markHydrated: () => void;
};

export const useOnboardingStore = create<OnboardingSlidesState>()(
  persist(
    (set) => ({
      hasSeenSlides: false,
      hasHydrated: false,
      markSlidesSeen: () => set({ hasSeenSlides: true }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'tripfy-onboarding-slides',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
      // Só persiste a flag em si — `hasHydrated` é derivado em runtime.
      partialize: (state) => ({ hasSeenSlides: state.hasSeenSlides }),
    },
  ),
);
