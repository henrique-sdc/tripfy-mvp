---
title: Detalhe da Viagem RF07
tags:
  - rf07
  - mapa
  - drag-and-drop
  - firestore
  - leaflet
data_criacao: 2026-07-14
status: ativo
aliases:
  - Trip Detail
  - RF07
---

# Detalhe da Viagem (RF07)

Tela `/trip-detail` após a geração SSE ([[Geração de Roteiro RF06]]).

## Capabilidades

| Feature                  | Como                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Layout                   | iOS e Android: mapa em cima (altura animada) + sheet embaixo. Puxa o grip pra cima e o mapa some; toque no grip volta. A lista **não** usa `translateY` — isso quebrava o DnD. |
| Chip **Todos**           | Primeiro botão; lista + mapa agregam todas as paradas (DnD desligado)                                                                  |
| Drag & drop (RF07.1)     | Handle ≡ original (`menu` 16px) com `TouchableOpacity` do gesture-handler + long-press no card. Só no dia (não em Todos). |
| Remover parada           | Swipe esquerda (Mail) — `dragOffsetFromRightEdge` pra não matar o DnD; mín. 1 atividade/dia                                            |
| Reordenar horários       | `reassignTimes` redistribui slots do dia após drag                                                                                     |
| Mapa                     | `TripOsmMap` — Leaflet + CARTO em WebView (Expo Go)                                                                                    |
| Entrada                  | Stash `pendingItinerary` (pós-geração) ou `tripId` (aba Viagens)                                                                       |
| **Auto-save**            | Debounce 700ms → `POST /trips` se for novo (teto Free), senão merge no Firestore. 402 abre o paywall e não entra em loop. Ver [[Tripfy Pro e Paywall]]. |
| Editar meta              | Toque no destino → destino + resumo + **notas pessoais** (`EditTripMetaModal`)                                                         |
| Editar título do dia     | Toque no título do dia → `EditDayTitleModal` (auto-save)                                                                               |
| Notas pessoais           | Campo `notes` no doc Firestore / `SavedTripResponse`; linha sob o título do dia                                                        |
| Editar parada            | Lápis no card → time + title + description + **dia** (cross-day)                                                                       |
| Nova parada              | FAB → `AddActivityModal` (só com dia selecionado); endereço opcional → Places lookup → pin no mapa                                     |
| Dias                     | Chip `+ Dia`; lixeira no título do dia (reindex 1..N); mín. 1 dia                                                                      |
| **Lixeira**              | Soft delete 30d (`deleted_at`); Configurações → `/trash`; swipe em Viagens; swipe na lixeira = purge definitivo                         |
| **Minhas avaliações**    | `GET /places/reviews/me` → `/my-reviews` (editar/excluir)                                                                              |
| **Compartilhar / Clone** | Share `tripfy://trip/{id}`; visitante vê read-only + “Clonar pra mim” (clone também passa no teto Free)                                |
| Dicas                    | `ListFooterComponent` no detail (check-in / segurança / offline)                                                                       |
| **Parceiros (RF10)**     | `PartnerReserveRow` (hotéis Booking / voos Skyscanner) + CTA GetYourGuide se `requires_ticket`. Ver [[Afiliados RF10]]                 |
| Places proxy             | `GET /places/lookup` — `place_id` + foto/nota/`open_now`                                                                               |
| Autocomplete destino     | `GET /places/autocomplete` — typeahead do wizard (RF05); `description` + `place_id`                                                    |
| Place Details            | `GET /places/{place_id}/details` — + `price_level` (`$$`) + `menu_uri` (quando Google expõe)                                           |
| Reviews Tripfy           | `GET/POST/DELETE` `/places/{place_id}/reviews` — Firestore `place_reviews`                                                             |

## Proxy Google Places (PASSO 1 — backend)

Endpoint autenticado que resolve enriquecimento visual dos cards:

```
GET /api/v1/places/lookup?query={nome}&lat={lat}&lng={lng}
Authorization: Bearer <Firebase ID Token>
```

| Campo resposta  | Origem                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| `place_id`      | `places.id` (New) / `place_id` (legacy) — âncora details/reviews               |
| `photo_url`     | Places Photos (New) com `skipHttpRedirect` → URI `googleusercontent` (sem key) |
| `rating`        | `places.rating`                                                                |
| `reviews_count` | `places.userRatingCount`                                                       |
| `open_now`      | `places.currentOpeningHours.openNow`                                           |

- Serviço: `services/places_service.py` · Router: `api/places_router.py`
- Chave: `GOOGLE_MAPS_API_KEY` (só server-side)
- Rate limit: `30/minute` por IP
- `lat`/`lng` opcionais **juntos** → `locationBias` 5 km
- Erros: `404` sem resultado · `502`/`504` falha Google · `503` key ausente/negada
- **Fallback:** se Places API (New) der 403, usa Text Search clássico (`maps.googleapis.com`) e resolve foto via redirect Location (sem key na URL)

## Autocomplete de destino (wizard RF05)

Sugestões reais do Google no assistente — o usuário **clica** numa opção; texto livre não gera roteiro.

```
GET /api/v1/places/autocomplete?input={prefixo}
Authorization: Bearer <Firebase ID Token>
```

| Campo          | Origem                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `description`  | New `placePrediction.text.text` / legacy `predictions[].description`   |
| `place_id`     | New `placeId` / legacy `place_id` (id inválido é descartado)           |

- Place Autocomplete (não Query Autocomplete). Tipos: cidade / estado / país.
- New → fallback legacy no 403, igual ao lookup. Lista vazia = `200`, não `404`.
- Rate limit: `60/minute` por IP. `input` 2–120 chars.
- Declarado **antes** de `/{place_id}/…` senão FastAPI captura `"autocomplete"` como path.
- Frontend: debounce 400ms + `AbortController`; dropdown `position: absolute` (sem layout shift). Trava do CTA: `selectedPlaceId`. Em Alta usa sentinela `curated`. Ver [[Home e Bottom Tabs]].

## Place Details + Reviews (backend Knowledge Panel)

```
GET  /api/v1/places/{place_id}/details     → PlaceFullDetailsResponse (20/min)
GET  /api/v1/places/{place_id}/reviews     → list[PlaceReviewResponse] (30/min)
POST /api/v1/places/{place_id}/reviews     → upsert do uid (10/min)
DELETE /api/v1/places/{place_id}/reviews/me → remove o próprio (10/min)
```

| `PlaceFullDetailsResponse`              | Fonte                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| name, formatted_address, phone, website | Place Details                                                                  |
| editorial_summary                       | editorial / generative summary                                                 |
| weekday_text, open_now                  | opening hours                                                                  |
| photo_urls (máx. 5)                     | resolvidas server-side                                                         |
| latitude, longitude                     | location / geometry                                                            |
| `price_level`                           | New `priceLevel` → `$`…`$$$$`; legacy `price_level` 0–4                        |
| `menu_uri`                              | Opcional; Google **não** documenta campo estável — null na maioria dos lugares |

**Reviews:** coleção `place_reviews`; doc id `{place_id}_{uid}` (1 review por usuário). Só Admin SDK — rules `allow read, write: if false`. Deploy: `firebase deploy --only firestore:rules`.

> [!warning] Google Cloud — obrigatório pra fotos
> No projeto da `GOOGLE_MAPS_API_KEY`, habilite **Places API (New)**  
> https://console.cloud.google.com/apis/library/places.googleapis.com  
> E na key: restrições de API → liberar `Places API` + `Places API (New)`.  
> Sem isso o lookup cai no legacy (se habilitado) ou falha.

> [!note] Próximos passos UI
> Auto-save + SyncIndicator + edit meta/description ✅ · Fases seguintes: gestão de dias, social/lixeira, clone.

## PlaceDetailsSheet (PASSO 2 frontend)

- `components/trip/PlaceDetailsSheet.tsx` — Modal + pan dismiss (física CreateTripSheet).
- Abas **Sobre** (fotos, rating, **preço médio**, menu se houver, resumo, endereço, horários) e **Comunidade**.
- Tap no hero do `ActivityCard` abre o sheet **sempre** — com `place_id` ou só com fallback do roteiro.
- Fallback: se Places falha ou devolve endereço como nome (`Cl. 82 #12 -21`), usa título/descrição/local da parada (`lib/placeDisplay.ts`).
- Lookup Places: `título, endereço` (endereço sozinho casa pin genérico).
- Comunidade desabilitada sem `place_id`.
- API: `getPlaceFullDetails`, `getPlaceReviews`, `upsertPlaceReview` em `lib/api.ts`.

## Edição tátil (PASSO 3)

- **Swipe-to-delete:** `ReanimatedSwipeable` — lixeira vermelha; ícone escala com `progress`; overswipe (`progress ≥ 1.45`) apaga; última parada do dia bloqueada.
- **DnD:** root único no `_layout`; handle ≡ + long-press; `dragOffsetFromRightEdge` no swipe.
- **FAB** “Nova Parada”: Alert “Em breve” (add manual no próximo ciclo).
- Remoção pelo X do card saiu — gesto = fonte da verdade.

## Auto-save (Fase 1)

- Abertura pós-SSE / qualquer edição marca `dirty` → debounce 700ms → `saveTrip`.
- Header: lápis (meta) + `<SyncIndicator>` (spinner / cloud-done / erro).
- Sem botão coração e sem Alerts de “salvo com sucesso”.

## ActivityCard (PASSO 2)

- Arquivo: `components/trip/ActivityCard.tsx`
- Lazy load no mount → `getPlaceDetails(title, lat, lng)` com `AbortController`
- Cache de sessão em `lib/api.ts` (troca de dia não re-consulta Places)
- Skeleton: pulso Reanimated 0.3→0.7 · foto: fade 220ms ease-out
- Sem foto / 404: card sólido `theme.surface` (não quebra a lista)
- i18n: `tripDetail.openNow` / `closedNow` / `reviewsCount`

## Mapa (`TripOsmMap`)

- **Por quê WebView:** `react-native-maps` (Google) fica bege no Expo Go Android — Expo removeu a API key compartilhada. `expo-maps` exige Dev Build.
- **Tiles:** CARTO Voyager (claro) / dark_all (escuro). Raster exige `EXPO_PUBLIC_CARTO_API_KEY` (`?key=`). Sem ela o tile vem com watermark "API KEY REQUIRED".
- **Init:** `window.load` + `invalidateSize` em timers; `baseUrl` `https://tripfy.app/` (iOS e Android).
- **Enquadramento:** após cada `invalidateSize`, reaplica `fitBounds` (2+ pontos, `maxZoom: 15`) ou `setView` zoom 13 (1 ponto). Evita zoom máximo quando o container ainda media 0.
- **DnD:** mapa **fora** da FlatList — senão o gesto de drag morre.

> [!tip] Dev Build futuro
> `app.config.js` injeta `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` do `.env` para builds nativos. No Expo Go usamos OSM/Leaflet.

## Persistência

- Coração cria/atualiza; long-press remove.
- Aba Viagens lista Firestore de verdade (`listTrips` / `getTrip`).

> [!tip] Rules
> Precisa `firebase deploy --only firestore:rules` com match em `users/{uid}/trips/{tripId}`.

## Observabilidade

- **Backend:** ao finalizar o SSE, `logger.info("Roteiro gerado com sucesso [UID=…]: {json}")`.
- **Frontend:** `console.info("[LLM Response] Roteiro parseado:", …)` após o parse no `done`.

## Relacionados

- [[Geração de Roteiro RF06]] — schema + SSE + lat/lng no prompt
- [[Afiliados RF10]] — PartnerReserveRow + requires_ticket
- [[Home e Bottom Tabs]] — entrada pelo Wizard Solo / aba Viagens
