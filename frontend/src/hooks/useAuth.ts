// Hook que liga Firebase Auth ↔ Zustand ↔ Backend.
// Deve ser chamado UMA vez, no layout raiz. Escuta onAuthStateChanged (que
// restaura a sessão persistida ao reabrir o app) e, no login, sincroniza o
// usuário com o backend para saber se o onboarding de preferências já foi feito.

import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";

import { NetworkError, syncUser } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";

export function useAuth(): void {
  const setUser = useAuthStore((s) => s.setUser);
  const setHasPreferences = useAuthStore((s) => s.setHasPreferences);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setBackendUnreachable = useAuthStore((s) => s.setBackendUnreachable);
  const markSyncFailedByNetwork = useAuthStore((s) => s.markSyncFailedByNetwork);

  useEffect(() => {
    // onAuthStateChanged dispara na subida (com a sessão restaurada, se houver)
    // e a cada login/logout. É a única fonte de verdade do usuário atual.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (!user) {
        setHasPreferences(null);
        setLoading(false);
        return;
      }

      try {
        // Cria o doc no primeiro login e descobre se já tem preferências.
        const result = await syncUser();
        setHasPreferences(result.has_preferences);
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
          setHasPreferences(false);
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [setUser, setHasPreferences, setLoading, setBackendUnreachable, markSyncFailedByNetwork]);
}
