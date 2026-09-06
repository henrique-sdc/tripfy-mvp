---
title: Afiliados RF10
tags:
  - rf10
  - afiliados
  - ota
  - monetizacao
data_criacao: 2026-09-05
status: ativo
aliases:
  - RF10
  - Smart Deep Links
  - OTAs
---

# Afiliados via Smart Deep Links (RF10)

A Tripfy **redireciona** para OTAs. Não busca inventário, não mostra preço e não intermedia a reserva.

> [!info] RF10 no MVP
> O PRD pede links/botões para parceiros (Booking, Skyscanner, GetYourGuide). Monetização CPA automatizada continua no backlog.

## Por que não Amadeus / API de hotel

| Caminho | Papel | Neste MVP |
| --- | --- | --- |
| Smart Deep Links | URL de busca com destino + datas + `aid`/`marker` | **Escolhido** |
| Travelpayouts | Rede de afiliados (Hotellook). Data API de preços é opcional depois | `EXPO_PUBLIC_TRAVELPAYOUTS_MARKER` troca a URL de hotel |
| Amadeus for Developers | GDS / metabusca in-app (IATA, quota, não paga CPA) | Fora. Trabalho futuro na banca, não no código |

O que deixa a demo realista: persistir `start_date` / `end_date` no doc da viagem e abrir a SERP da OTA já preenchida. Sem datas, o link ainda abre (só a cidade).

## Schema

- `ActivityResponse.requires_ticket: bool` (default `false`) — a LLM marca; o app **não** pede URL à IA.
- Datas **não** entram no Structured Output. São metadado gravado no Firestore junto do roteiro (`SavedTripResponse`), anexadas no `stashPendingItinerary` após o SSE ([[Geração de Roteiro RF06]], [[Match de Viajantes RF11 RF12]]).
- Sem `lodging_vibe`. O botão de hotel usa destino + intervalo.

Prompt: regra 11 em `SYSTEM_PROMPT` — True só para ingresso pago (museu, parque, show, tour). Na dúvida, False.

## URLs (`frontend/src/lib/affiliates.ts`)

IDs públicos (`EXPO_PUBLIC_*`). Não são segredo de backend.

| Função | Destino |
| --- | --- |
| `buildBookingHotelsUrl` | Booking `searchresults.html?ss=&checkin=&checkout=&aid=` — ou Hotellook se houver marker Travelpayouts |
| `buildSkyscannerFlightsUrl` | `.../passagens-aereas/{origem}/{destino}/{yymmdd}/{yymmdd}/?adultsv2=1&cabinclass=economy&rtn=1`. Origem default `saoa` (São Paulo qualquer). Destino = entity ID (Lisboa→`lis`, Moçambique→`mz`), não o nome da cidade. |
| `buildGetYourGuideUrl` | `getyourguide.com.br/s/?q={título destino}&partner_id=` |

`Linking.openURL(https)` — Universal Link abre o app da OTA se estiver instalado. Sem URL scheme no Info.plist.

Variáveis (opcionais; default mock de TCC):

- `EXPO_PUBLIC_BOOKING_AID`
- `EXPO_PUBLIC_SKYSCANNER_ASSOCIATE_ID`
- `EXPO_PUBLIC_SKYSCANNER_ORIGIN` (default `saoa`)
- `EXPO_PUBLIC_GETYOURGUIDE_PARTNER_ID`
- `EXPO_PUBLIC_TRAVELPAYOUTS_MARKER`

## UI ([[Detalhe da Viagem RF07]])

- `PartnerReserveRow`: agrupado inset (surface + hairline), ícones `bed-outline` / `airplane-outline` no accent do tema. Sem azul Booking / amarelo Skyscanner.
- GetYourGuide: texto no `ActivityCard` só se `requires_ticket`.
- Copy: “Ver hotéis” / “Voos para” — nunca “Reservar na Tripfy”. Disclaimer: redirecionamento ao parceiro.

## Legal

Redirecionamento, não agência. Sem preço gerado por IA (CDC). Lei do Turismo: a Tripfy não intermedia a hospedagem.

## Relacionados

- [[Geração de Roteiro RF06]]
- [[Detalhe da Viagem RF07]]
- [[Match de Viajantes RF11 RF12]]
- [[changelog]]
