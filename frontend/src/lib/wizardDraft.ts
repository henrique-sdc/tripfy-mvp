// Rascunho do Wizard Solo — sobrevive a remount ao ir/voltar de edit-vibe.
// Mesmo padrão de `pendingItinerary` (memória de processo, sem AsyncStorage).

export type WizardSoloDraft = {
  destination: string;
  /** place_id do Google, ou sentinela `curated` da Em Alta. */
  place_id: string | null;
  /** ISO YYYY-MM-DD */
  start_date: string;
  /** ISO YYYY-MM-DD */
  end_date: string;
  days: number;
  budget: string;
  notes: string;
};

let draft: WizardSoloDraft | null = null;

export function stashWizardSoloDraft(next: WizardSoloDraft): void {
  draft = { ...next };
}

/** Lê sem limpar — Strict Mode remonta e ainda precisa do payload. */
export function peekWizardSoloDraft(): WizardSoloDraft | null {
  return draft;
}

export function clearWizardSoloDraft(): void {
  draft = null;
}
