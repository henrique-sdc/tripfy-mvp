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

FAB ametista abre CreateTripSheet. Solo → `/wizard/solo`. Explorar é stack (`/explore`), não uma quinta aba: a barra parte 4 rotas ao redor do FAB (`TAB_COUNT = 4`).

iOS: BlurView Liquid Glass. Android: pill surface. `useTabBarPadding()` no scroll.

## CreateTripSheet

Modal + GestureHandlerRootView interno. Dismiss tap/pan. RichChoiceCard (FadeInDown no wrapper). i18n `createTrip.*`. Free no teto de 2 viagens ativas abre o paywall em vez do wizard — [[Tripfy Pro e Paywall]].

## Wizard Solo

Destino via Place Autocomplete (proxy FastAPI, debounce 400ms, lista flutuante). CTA só habilita depois do toque numa sugestão (ou destino da Em Alta). Calendário ida/volta (máx. 15 dias), CapsuleSelector, notas, revisar vibe. Layout StyleSheet nativo. Ver [[Detalhe da Viagem RF07]].

## Home

Dados reais no `useFocusEffect`:

- **Avatar** — `getUserProfile()` + `profilePhotoUri()` (Firestore `photoBase64` ou Auth `photoURL`); tap → aba Perfil.
- **Último roteiro** — `getLatestTrip()` (`updated_at` desc); foto via `getPlaceDetails`; skeleton `h-[88]`; empty → CTA `CreateTripSheet`. Sem countdown de datas (YAGNI).
- **Convite de Match** — `GET /api/v1/matches/invites` no foco, a cada 5 s com a Home aberta, e no pull-to-refresh. Banner no topo: Aceitar entra na sala (`POST /join`), Recusar zera `invitee_uid`. Sem swipe.
- **Destinos da vibe** — `getRecommendedDestinations(travel_preferences)` catálogo estático ranqueado por `interests` ([[Preferências Sua Vibe]]).
- **FAB** — `createTripSheetStore.open()`.
- **Explorar** — card na Home → `/explore`. Feed de roteiros publicados (RF08). Catálogo estático da Em Alta continua separado.
- **Em Alta** — catálogo local → `/trending`.

## Explorar

O feed não varre `users/{uid}/trips`. Publicar (`POST /trips/{id}/publish`, só o dono) grava `is_public` no doc canônico e um cartão em `explore_trips/{tripId}`: destino, título, resumo, `day_count`, `owner_name`, `published_at`, `clone_count`. Sem `days`, notas, e-mail ou UID. O client lê (autenticado); escreve só a API. `is_public`, `published_at` e `invite_hash` estão na denylist do auto-save.

- Recentes: `orderBy(published_at desc) limit 20`, página com `startAfter`.
- Em alta: `orderBy(clone_count desc) limit 20`. O clone incrementa o contador em best-effort.
- Destino: igualdade em `destination_key` + `published_at`. Índice composto em `firestore.indexes.json`. Prefixo (“lis” → Lisboa) fica de fora.

Abrir um card reusa `/trip/{id}` (leitura + clonar). Tirar do feed apaga o cartão e não apaga `trip_shares`.

Deploy: `firebase deploy --only firestore:rules,firestore:indexes`. Sem as rules, o feed não lista; sem o índice, a busca por destino falha.

Ver [[Match de Viajantes RF11 RF12]].

## Aba Viagens

Lista premium em `(tabs)/trips.tsx`:

- `TripHistoryCard` — foto do destino via `getPlaceDetails(destination)`, meta (dias · relativo), press 0.97.
- Filtro em pílulas (`CapsuleSelector`): **Todos** / **Matches**. Match = doc com `match_id` (gravado no auto-save pós-lobby). Roteiros antigos sem o campo só aparecem em Todos. **Offline** só entra quando há pelo menos um pin neste celular — ver [[Modo Offline]].
- Swipe-to-delete (mesmo padrão Mail do [[Detalhe da Viagem RF07]]) → soft delete otimista; restore em `/trash`.
- Em `/trash`, swipe apaga de vez (`purgeTrip`).
- Pull-to-refresh; empty state com CTA → `createTripSheetStore.open()`.

## Stores

`createTripSheetStore`, `wishlistStore` (AsyncStorage).
