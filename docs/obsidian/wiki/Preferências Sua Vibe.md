# Preferências de Viagem — Tela "Sua Vibe"

Onboarding tátil pós-cadastro (Seção 3.3 / RF01). Substitui o formulário genérico de 6 chips por uma experiência **100% touch** inspirada em Apple Music / Pinterest.

Relacionado: [[Autenticação Full Stack]], [[Design System Auth]]

## Princípio de produto

Não perguntamos — pedimos para **tocar no que o usuário ama**. Cada toque vibra (`Haptics`) e anima com spring. Zero campos de texto.

**Tom de copy:** perfil geral do viajante, não uma viagem específica. Títulos no estilo "Como você costuma…?" / "Quando viaja, você…" — evita parecer que o roteiro já está sendo montado (isso vem depois, no RF06).

## Seções da tela

| # | Seção | UI | Obrigatório p/ CTA |
|---|-------|-----|-------------------|
| 1 | Cabeçalho | Título + subtítulo (stop slop) | — |
| 2 | Interesses | 14 pills minimalistas | ≥ 1 |
| 3 | Ritmo (pace) | 3 cards grandes (2+1) | 1 |
| 4 | Locomoção | Pills multi-select | Não |
| 5 | Alimentação | Pills single-select | Não (default `none`) |
| 6 | Orçamento | Cápsula deslizante | Sim (default `moderate`) |
| 7 | Companhia | Cápsula deslizante | Não (default `couple`) |
| 8 | CTA flutuante | Sticky; barra sólida (Android) ou fade no topo (iOS) | — |

CTA desabilitado até: **1 interesse + ritmo + orçamento**. Quando válido: texto "Tudo pronto 🚀" + pulsação leve.

## Modelo de dados (backend)

Arquivo: `backend/models/user.py` — enum como fonte da verdade.

```python
class TravelPreferences(BaseModel):
    interests: list[Interest]       # min 1
    pace: Pace                      # intense | balanced | relaxed
    transport_modes: list[TransportMode]  # walking | public_transit | ride_hail
    dietary_style: DietaryStyle     # none | vegetarian | vegan
    budget_range: BudgetRange
    traveler_type: TravelerType
    other_preferences: str = ""     # texto livre, máx 280 — ver nota abaixo
```

> [!info] `other_preferences` (adicionado — [[Gerenciamento de Perfil RF03]])
> Campo de texto livre opcional, editável em `/edit-vibe` (fora do onboarding, que
> permanece só com tags fixas). Vai para `<perfil_viajante>` no prompt via
> `sanitize_user_text` (mesma blindagem anti-injection das `notes` do wizard) —
> não é só cosmético, a IA realmente lê isso ao montar o roteiro.

### Por que cada campo existe (valor pro LLM / Maps)

| Campo | Impacto no roteiro |
|-------|-------------------|
| **Interesses granulares** (14 tags) | Gemini especifica paradas (ex.: "Cafés" → pausa às 15h) |
| **Pace** | Densidade horária — evita acordar quem é `relaxed` cedo demais |
| **Transport modes** | PRD 3.2 — deslocamentos coerentes no Google Maps |
| **Dietary** | RF06.1 — restaurantes sem quebrar confiança |
| **Budget / Traveler** | Tom de sugestões e tipo de grupo (já existiam) |

### Breaking change (MVP)

Enums antigos (`culture`, `gastronomy`…) foram **substituídos**. Usuários de dev com prefs antigas no Firestore precisam refazer onboarding.

## Frontend

| Arquivo | Papel |
|---------|-------|
| `constants/travel-preferences.ts` | Valores espelhados dos enums |
| `components/onboarding/InterestPill.tsx` | Pill com bounce 0.95→1.05→1 |
| `components/onboarding/PaceCard.tsx` | Card com dim dos não-selecionados |
| `components/onboarding/CapsuleSelector.tsx` | Indicador deslizante (budget/traveler); segmentos de largura igual |
| `app/(onboarding)/preferences.tsx` | Tela completa |

## Roadmap PM (não implementado)

Campos candidatos para aumentar acurácia do LLM sem inflar a UI:

- **Tolerância a multidões** (`crowds_ok` vs `off_beaten_path`) — 2 pills
- **Estilo de hospedagem** (`boutique_local` vs `chain_comfort`) — afeta bairros sugeridos
- **Horário preferido de saída** — derivado do `pace`, talvez redundante

Decisão: só implementar quando o prompt engineering provar ganho mensurável.
