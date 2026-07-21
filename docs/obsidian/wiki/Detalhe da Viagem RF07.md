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
| Feature | Como |
|---------|------|
| Layout | Mapa em cima (~34%) + lista embaixo (sem toggle) |
| Chip **Todos** | Primeiro botão; lista + mapa agregam todas as paradas (DnD desligado) |
| Drag & drop (RF07.1) | `react-native-draggable-flatlist` no dia selecionado |
| Remover parada | Swipe esquerda (Mail) — mín. 1 atividade/dia |
| Reordenar horários | `reassignTimes` redistribui slots do dia após drag |
| Mapa | `TripOsmMap` — Leaflet + CARTO em WebView (Expo Go) |
| Entrada | Stash `pendingItinerary` (pós-geração) ou `tripId` (aba Viagens) |
| Salvar | coração → `users/{uid}/trips/{tripId}` (client SDK) |
| Places proxy | `GET /places/lookup` — `place_id` + foto/nota/`open_now` |
| Place Details | `GET /places/{place_id}/details` — painel rico (Google) |
| Reviews Tripfy | `GET/POST/DELETE` `/places/{place_id}/reviews` — Firestore `place_reviews` |

## Proxy Google Places (PASSO 1 — backend)

Endpoint autenticado que resolve enriquecimento visual dos cards:

```
GET /api/v1/places/lookup?query={nome}&lat={lat}&lng={lng}
Authorization: Bearer <Firebase ID Token>
```

| Campo resposta | Origem |
|----------------|--------|
| `place_id` | `places.id` (New) / `place_id` (legacy) — âncora details/reviews |
| `photo_url` | Places Photos (New) com `skipHttpRedirect` → URI `googleusercontent` (sem key) |
| `rating` | `places.rating` |
| `reviews_count` | `places.userRatingCount` |
| `open_now` | `places.currentOpeningHours.openNow` |

- Serviço: `services/places_service.py` · Router: `api/places_router.py`
- Chave: `GOOGLE_MAPS_API_KEY` (só server-side)
- Rate limit: `30/minute` por IP
- `lat`/`lng` opcionais **juntos** → `locationBias` 5 km
- Erros: `404` sem resultado · `502`/`504` falha Google · `503` key ausente/negada
- **Fallback:** se Places API (New) der 403, usa Text Search clássico (`maps.googleapis.com`) e resolve foto via redirect Location (sem key na URL)

## Place Details + Reviews (backend Knowledge Panel)

```
GET  /api/v1/places/{place_id}/details     → PlaceFullDetailsResponse (20/min)
GET  /api/v1/places/{place_id}/reviews     → list[PlaceReviewResponse] (30/min)
POST /api/v1/places/{place_id}/reviews     → upsert do uid (10/min)
DELETE /api/v1/places/{place_id}/reviews/me → remove o próprio (10/min)
```

| `PlaceFullDetailsResponse` | Fonte |
|----------------------------|--------|
| name, formatted_address, phone, website | Place Details |
| editorial_summary | editorial / generative summary |
| weekday_text, open_now | opening hours |
| photo_urls (máx. 5) | resolvidas server-side |
| latitude, longitude | location / geometry |

**Reviews:** coleção `place_reviews`; doc id `{place_id}_{uid}` (1 review por usuário). Só Admin SDK — rules `allow read, write: if false`. Deploy: `firebase deploy --only firestore:rules`.

> [!warning] Google Cloud — obrigatório pra fotos
> No projeto da `GOOGLE_MAPS_API_KEY`, habilite **Places API (New)**  
> https://console.cloud.google.com/apis/library/places.googleapis.com  
> E na key: restrições de API → liberar `Places API` + `Places API (New)`.  
> Sem isso o lookup cai no legacy (se habilitado) ou falha.

> [!note] Próximos passos UI
> Sheet Knowledge Panel + edit time/title ✅ · Modo Edição avançado (notas, troca de local, add real) e mapa nativo depois.

## PlaceDetailsSheet (PASSO 2 frontend)

- `components/trip/PlaceDetailsSheet.tsx` — Modal + pan dismiss (física CreateTripSheet).
- Abas **Sobre** (fotos, rating Google, resumo, endereço, horários) e **Comunidade** (reviews Tripfy + form).
- Tap no hero do `ActivityCard` (com `place_id`) abre o sheet; lápis abre `EditActivityModal` (time + title).
- API: `getPlaceFullDetails`, `getPlaceReviews`, `upsertPlaceReview` em `lib/api.ts`.

## Edição tátil (PASSO 3)

- **Swipe-to-delete:** `ReanimatedSwipeable` — lixeira vermelha; ícone escala com `progress`; overswipe (`progress ≥ 1.45`) apaga; última parada do dia bloqueada.
- **DnD:** `onDragBegin` Light + `onDragEnd` Medium; sombra no row ativo; `reassignTimes` intacto.
- **FAB** “Nova Parada”: Alert “Em breve” (add manual no próximo ciclo).
- Remoção pelo X do card saiu — gesto = fonte da verdade.

## ActivityCard (PASSO 2)

- Arquivo: `components/trip/ActivityCard.tsx`
- Lazy load no mount → `getPlaceDetails(title, lat, lng)` com `AbortController`
- Cache de sessão em `lib/api.ts` (troca de dia não re-consulta Places)
- Skeleton: pulso Reanimated 0.3→0.7 · foto: fade 220ms ease-out
- Sem foto / 404: card sólido `theme.surface` (não quebra a lista)
- i18n: `tripDetail.openNow` / `closedNow` / `reviewsCount`

## Mapa (`TripOsmMap`)

- **Por quê WebView:** `react-native-maps` (Google) fica bege no Expo Go Android — Expo removeu a API key compartilhada. `expo-maps` exige Dev Build.
- **Tiles:** CARTO Voyager (claro) / dark_all (escuro) — sem API key.
- **Init:** `window.load` + `invalidateSize` em timers; `baseUrl` https no Android.
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
- [[Home e Bottom Tabs]] — entrada pelo Wizard Solo / aba Viagens
