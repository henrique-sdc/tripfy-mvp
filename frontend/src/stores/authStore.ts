// Store global de autenticação (Zustand).
// Escolhemos Zustand em vez de Context API/Redux: estado pequeno, sem
// boilerplate de providers/reducers (Seção 8 — simplicidade).
// A store é a fonte da verdade do estado de auth para toda a navegação.

import type { User } from "firebase/auth";
import { create } from "zustand";

export type SubscriptionTier = "free" | "pro";

export type AuthSyncSlice = {
  has_preferences: boolean;
  is_premium: boolean;
  tier: SubscriptionTier;
  premium_until: string | null;
};

type AuthState = {
  // Usuário do Firebase, ou null quando deslogado.
  user: User | null;
  // Se o usuário já concluiu o formulário de preferências (Seção 3.3).
  // Decide entre onboarding e home. null = ainda não sabemos (sync pendente).
  hasPreferences: boolean | null;
  isPremium: boolean;
  tier: SubscriptionTier;
  premiumUntil: string | null;
  // true durante a checagem inicial de sessão — mantém a splash visível.
  isLoading: boolean;
  // true quando o backend está inalcançável (falha de rede, não de auth).
  // Usado só para exibir o banner discreto — nunca bloqueia navegação.
  backendUnreachable: boolean;

  setUser: (user: User | null) => void;
  setHasPreferences: (hasPreferences: boolean | null) => void;
  setLoading: (isLoading: boolean) => void;
  setBackendUnreachable: (backendUnreachable: boolean) => void;
  applySync: (sync: AuthSyncSlice) => void;
  clearSessionFlags: () => void;
  /**
   * Chamado quando o sync com o backend falha por erro de rede.
   * Nunca força onboarding: se hasPreferences ainda é desconhecido (null),
   * assume true (deixa o usuário seguir para as tabs) — ficar travado numa
   * tela em branco é pior do que, no raro caso de 1º login sem rede, pular
   * o onboarding (ele pode preencher preferências depois, no Perfil).
   */
  markSyncFailedByNetwork: () => void;
};

const EMPTY_ENTITLEMENT = {
  isPremium: false,
  tier: "free" as SubscriptionTier,
  premiumUntil: null,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hasPreferences: null,
  ...EMPTY_ENTITLEMENT,
  isLoading: true,
  backendUnreachable: false,

  setUser: (user) => set({ user }),
  setHasPreferences: (hasPreferences) => set({ hasPreferences }),
  setLoading: (isLoading) => set({ isLoading }),
  setBackendUnreachable: (backendUnreachable) => set({ backendUnreachable }),

  applySync: (sync) =>
    set({
      hasPreferences: sync.has_preferences,
      isPremium: sync.is_premium,
      tier: sync.tier,
      premiumUntil: sync.premium_until,
    }),

  clearSessionFlags: () =>
    set({
      hasPreferences: null,
      ...EMPTY_ENTITLEMENT,
    }),

  markSyncFailedByNetwork: () =>
    set({
      backendUnreachable: true,
      hasPreferences: get().hasPreferences ?? true,
    }),
}));

// `isAuthenticated` é derivado de `user` — evita um campo extra que poderia
// ficar dessincronizado. Use este seletor onde precisar do booleano.
export const selectIsAuthenticated = (state: AuthState): boolean =>
  state.user !== null;
