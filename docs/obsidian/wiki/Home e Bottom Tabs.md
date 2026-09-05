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

Destino via Place Autocomplete (proxy FastAPI, debounce 400ms, lista flutuante). CTA só habilita depois do toque numa sugestão (ou destino da Em Alta). Calendário ida/volta (máx. 15 dias), CapsuleSelector, notas, revisar vibe. Layout StyleSheet nativo. Ver [[Detalhe da Viagem RF07]].

## Home

Dados reais no `useFocusEffect`:

- **Avatar** — `getUserProfile()` + `profilePhotoUri()` (Firestore `photoBase64` ou Auth `photoURL`); tap → aba Perfil.
- **Último roteiro** — `getLatestTrip()` (`updated_at` desc); foto via `getPlaceDetails`; skeleton `h-[88]`; empty → CTA `CreateTripSheet`. Sem countdown de datas (YAGNI).
- **Match pendente** — `GET /api/v1/matches/pending` (owner + `waiting`); banner swipe-dismiss → `/match/{id}`.
- **Destinos da vibe** — `getRecommendedDestinations(travel_preferences)` catálogo estático ranqueado por `interests` ([[Preferências Sua Vibe]]).
- **AiCommandBar / FAB** — `createTripSheetStore.open()`.
- **Em Alta** — catálogo local → `/trending`.

Ver [[Match de Viajantes RF11 RF12]].

## Aba Viagens

Lista premium em `(tabs)/trips.tsx`:

- `TripHistoryCard` — foto do destino via `getPlaceDetails(destination)`, meta (dias · relativo), press 0.97.
- Swipe-to-delete (mesmo padrão Mail do [[Detalhe da Viagem RF07]]) → soft delete otimista; restore em `/trash`.
- Em `/trash`, swipe apaga de vez (`purgeTrip`).
- Pull-to-refresh; empty state com CTA → `createTripSheetStore.open()`.

## Stores

`createTripSheetStore`, `wishlistStore` (AsyncStorage).
