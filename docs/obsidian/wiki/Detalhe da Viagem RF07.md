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
| Layout | Mapa em cima (~38%) + lista embaixo (sem toggle) |
| Drag & drop (RF07.1) | `react-native-draggable-flatlist` no dia selecionado |
| Remover parada | ícone X no card (mín. 1 atividade/dia) |
| Reordenar horários | `reassignTimes` redistribui slots do dia após drag |
| Mapa | `TripOsmMap` — Leaflet + CARTO em WebView (Expo Go) |
| Salvar | coração → `users/{uid}/trips/{tripId}` (client SDK) |

> [!warning] Coordenadas opcionais
> `latitude` / `longitude` podem vir `null` da IA. O mapa filtra só pontos válidos; se o dia não tiver coords, mostra empty state (não crasha).

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
