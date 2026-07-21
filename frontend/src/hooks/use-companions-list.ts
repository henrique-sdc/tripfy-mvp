// Escuta users/{me}.companions e hidrata via API quando a lista muda.
// O dono pode ler o próprio doc (rules); o perfil público dos amigos vem do proxy.

import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { listMyCompanions, type UserPublicProfile } from "@/lib/api";
import { auth, db } from "@/lib/firebase";

function companionsKey(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw.map(String).sort().join(",");
}

export function useCompanionsList() {
  const [companions, setCompanions] = useState<UserPublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const lastKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listMyCompanions();
      setCompanions(list);
    } catch (err) {
      console.error("[companions] refresh:", err);
      setCompanions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setCompanions([]);
      setLoading(false);
      return;
    }

    // Snapshot no próprio doc: quando o amigo aceita, o Admin SDK atualiza
    // companions aqui e a UI reage sem precisar refocar a tela.
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const key = companionsKey(snap.data()?.companions);
        if (lastKeyRef.current === key) return;
        lastKeyRef.current = key;
        void refresh();
      },
      (err) => {
        console.error("[companions] snapshot:", err);
        setLoading(false);
      },
    );

    return unsub;
  }, [refresh]);

  return { companions, setCompanions, loading, refresh };
}
