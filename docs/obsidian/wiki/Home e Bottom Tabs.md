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

- **Header** — wordmark `Tripfy` fixo acima do scroll, centralizado; avatar à direita (`getUserProfile()` + `profilePhotoUri()`, tap → aba Perfil). A saudação (`Bom dia, nome`) rola com o conteúdo. O pull-to-refresh fica abaixo do header, senão o spinner do iOS some atrás dele.
- **Último roteiro** — `getLatestTrip()` (`updated_at` desc); foto via `getPlaceDetails`; skeleton `h-[88]`; empty → CTA `CreateTripSheet`. Sem countdown de datas (YAGNI).
- **Convite de Match** — `GET /api/v1/matches/invites` no foco, a cada 5 s com a Home aberta, e no pull-to-refresh. Banner no topo: Aceitar entra na sala (`POST /join`), Recusar zera `invitee_uid`. Sem swipe.
- **Destinos da vibe** — `POST /users/me/vibe-picks` devolve 3 cidades (LLM só se a vibe mudou). Foto via `getPlaceDetails`. Toque sem `trip_id` gera 4 dias a partir da próxima segunda e grava o id no card; o toque seguinte abre essa viagem. Teto Free vale antes do stream.
- **FAB** — `createTripSheetStore.open()`.
- **Explorar** — carrossel dos publicados recentes (foto via `getPlaceDetails`). Chevron → `/explore`. Toque no card abre `/trip/{id}`. Coração no canto da foto; autor e dias na mesma linha.
- **Em Alta** — top 10 salvos na semana UTC (`week_id` + `week_saves`). Home mostra os primeiros; `/trending` lista os 10 com o mesmo card. Sem catálogo falso.

## Explorar

O feed não varre `users/{uid}/trips`. Publicar (`POST /trips/{id}/publish`, só o dono) grava `is_public` no doc canônico e um cartão em `explore_trips/{tripId}`: destino, título, resumo, `day_count`, `owner_name`, `published_at`, `clone_count`, `week_id`, `week_saves`. Sem `days`, notas, e-mail ou UID. O client lê (autenticado); escreve só a API.

- Recentes: `orderBy(published_at desc) limit 20`, página com `startAfter`. A Home pega os 8 primeiros. Cada linha da tela mostra a foto do destino (`getPlaceDetails`) ao lado do título, da meta e do resumo.
- Em alta: `where(week_id == semana UTC) orderBy(week_saves desc) limit 10`. O coração (`POST/DELETE /trips/{id}/save`) soma uma vez por pessoa. Desfazer na mesma semana diminui. Dedupe em `explore_saves/{tripId}_{uid}`.
- Destino: igualdade em `destination_key` + `published_at`. Índices em `firestore.indexes.json`. Prefixo (“lis” → Lisboa) fica de fora.

`clone_count` continua no clone e não ordena o Em alta. Abrir um card reusa `/trip/{id}` (leitura + clonar). Tirar do feed apaga o cartão e não apaga `trip_shares`.

Deploy: `firebase deploy --only firestore:rules,firestore:indexes`. Sem o índice `week_id` + `week_saves`, o Em alta não lista.

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
