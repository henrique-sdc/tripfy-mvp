// Handoff do roteiro gerado → /trip-detail sem serializar na URL.
// Params do Expo Router truncam JSON grande (GPT multi-dia estoura fácil).

import type { ItineraryResponse } from "@/lib/api";

let pending: ItineraryResponse | null = null;

/** Guarda o roteiro antes do `router.replace` para o detail consumir. */
export function stashPendingItinerary(itinerary: ItineraryResponse): void {
  pending = itinerary;
}

/** Lê sem limpar — Strict Mode remonta e ainda precisa do payload. */
export function peekPendingItinerary(): ItineraryResponse | null {
  return pending;
}

/** Limpa só se precisar invalidar (próximo stash já sobrescreve). */
export function clearPendingItinerary(): void {
  pending = null;
}
