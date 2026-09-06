// Handoff do roteiro gerado → /trip-detail sem serializar na URL.
// Params do Expo Router truncam JSON grande (GPT multi-dia estoura fácil).

import type { ItineraryResponse } from "@/lib/api";

let pending: ItineraryResponse | null = null;
let pendingMatchId: string | null = null;

/** Guarda o roteiro antes do `router.replace` para o detail consumir. */
export function stashPendingItinerary(
  itinerary: ItineraryResponse,
  opts?: { matchId?: string },
): void {
  pending = itinerary;
  const id = opts?.matchId?.trim();
  pendingMatchId = id || null;
}

/** Lê sem limpar — Strict Mode remonta e ainda precisa do payload. */
export function peekPendingItinerary(): ItineraryResponse | null {
  return pending;
}

/** Sessão de Match que gerou o stash; null no fluxo solo. */
export function peekPendingMatchId(): string | null {
  return pendingMatchId;
}

/** Limpa só se precisar invalidar (próximo stash já sobrescreve). */
export function clearPendingItinerary(): void {
  pending = null;
  pendingMatchId = null;
}
