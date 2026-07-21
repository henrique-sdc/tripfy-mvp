---
tags:
  - frontend
  - navegacao
  - rf04
  - rf05
  - rf08
  - design-system
data_criacao: 2026-07-13
status: ativo
---

# Home e Bottom Tabs (RF04)

Navegação principal pós-auth, Home premium e Wizard Solo (RF05).

Relacionado: [[Design System Auth]], [[Autenticação Full Stack]], [[Preferências Sua Vibe]]

## Tabs

```
Início | Salvos | [✨ FAB] | Viagens | Perfil
```

FAB ametista abre CreateTripSheet. Solo → `/wizard/solo`. Explorar removido.

iOS: BlurView Liquid Glass. Android: pill surface. `useTabBarPadding()` no scroll.

## CreateTripSheet

Modal + GestureHandlerRootView interno. Dismiss tap/pan. RichChoiceCard (FadeInDown no wrapper). i18n `createTrip.*`.

## Wizard Solo

Destino, DayStepper, CapsuleSelector, notas, revisar vibe. Layout StyleSheet nativo. RF06 ainda mock.

## Home

Ticket ≤7d · AiCommandBar · Invite swipe-delete · Destinos+❤️ · Em Alta → `/trending`

## Aba Viagens

Lista premium em `(tabs)/trips.tsx`:

- `TripHistoryCard` — foto do destino via `getPlaceDetails(destination)`, meta (dias · relativo), press 0.97.
- Swipe-to-delete (mesmo padrão Mail do [[Detalhe da Viagem RF07]]) → soft delete otimista; restore em `/trash`.
- Em `/trash`, swipe apaga de vez (`purgeTrip`).
- Pull-to-refresh; empty state com CTA → `createTripSheetStore.open()`.

## Stores

`createTripSheetStore`, `wishlistStore` (AsyncStorage).
