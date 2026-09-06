// Hook que liga Firebase Auth ↔ Zustand ↔ Backend.
// Deve ser chamado UMA vez, no layout raiz. Escuta onAuthStateChanged (que
// restaura a sessão persistida ao reabrir o app) e, no login, sincroniza o
// usuário com o backend para saber se o onboarding de preferências já foi feito.

import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";

import { NetworkError, syncUser } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { usePaywallStore } from "@/stores/paywallStore";

export function useAuth(): void {
  const setUser = useAuthStore((s) => s.setUser);
  const applySync = useAuthStore((s) => s.applySync);
  const clearSessionFlags = useAuthStore((s) => s.clearSessionFlags);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setBackendUnreachable = useAuthStore((s) => s.setBackendUnreachable);
  const markSyncFailedByNetwork = useAuthStore((s) => s.markSyncFailedByNetwork);

  useEffect(() => {
    // onAuthStateChanged dispara na subida (com a sessão restaurada, se houver)
    // e a cada login/logout. É a única fonte de verdade do usuário atual.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (!user) {
        clearSessionFlags();
        usePaywallStore.getState().close();
        setLoading(false);
        return;
      }

      try {
        // Cria o doc no primeiro login e descobre se já tem preferências + Pro.
        const result = await syncUser();
        applySync({
          has_preferences: result.has_preferences,
          is_premium: Boolean(result.is_premium),
          tier: result.tier === "pro" ? "pro" : "free",
          premium_until: result.premium_until ?? null,
        });
        setBackendUnreachable(false);
      } catch (error) {
        console.error("[useAuth] Falha ao sincronizar usuário com o backend:", error);

        if (error instanceof NetworkError) {
          // O usuário já está autenticado pelo Firebase — a falta de rede
          // com o backend NUNCA deve travar a navegação (Missão 1).
          markSyncFailedByNetwork();
        } else {
          // Erro de aplicação (ex.: token rejeitado). Fallback seguro: leva
          // ao onboarding — salvar preferências de novo é idempotente.
          applySync({
            has_preferences: false,
            is_premium: false,
            tier: "free",
            premium_until: null,
          });
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [
    setUser,
    applySync,
    clearSessionFlags,
    setLoading,
    setBackendUnreachable,
    markSyncFailedByNetwork,
  ]);
}
