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
| `buildAirbnbStaysUrl` | `airbnb.com.br/s/{cidade}/homes?checkin=&checkout=&adults=2`. Cidade = trecho antes da vírgula |
| `buildViatorSearchUrl` | `viator.com/searchResults/all?text={título destino}` |
| `buildCarRentalUrl` | `discovercars.com/?location={cidade}&pickup=&dropoff=` |
| `buildEsimUrl` | País no destino (`Paris, França`) → `airalo.com/france-esim`. Sem país → `airalo.com/?q={cidade}` (`/search` responde 404) |
| `buildInsuranceUrl` | Landing `segurospromo.com.br`. Sem destino na query |

`Linking.openURL(https)` — Universal Link abre o app da OTA se estiver instalado. Sem URL scheme no Info.plist.

Variáveis (opcionais; default mock de TCC):

- `EXPO_PUBLIC_BOOKING_AID`
- `EXPO_PUBLIC_SKYSCANNER_ASSOCIATE_ID`
- `EXPO_PUBLIC_SKYSCANNER_ORIGIN` (default `saoa`)
- `EXPO_PUBLIC_GETYOURGUIDE_PARTNER_ID`
- `EXPO_PUBLIC_TRAVELPAYOUTS_MARKER`

## UI ([[Detalhe da Viagem RF07]])

O roteiro já tem o seletor `Planejar | Viajar` e o FAB de nova parada. A central **não** é um segundo segmento nem um segundo FAB: um card no topo da lista abre o `BookingHubSheet`.

> [!info] Sem preço no app
> A comparação é dois parceiros com a mesma busca preenchida. A OTA mostra a tarifa. Estimativa da IA fica de fora (CDC).

- Card-resumo: título, destino e datas, monogramas B / S / G, chevron.
- Sheet em grupos inset (surface + hairline). Cor de marca só no tile; o card segue o tema. Sem blur — o fundo do sheet é opaco.
- Hospedagem: Booking e Airbnb. Voos: Skyscanner. Ingressos: uma linha por parada com `requires_ticket` (GetYourGuide). Complementares: Airalo, Seguros Promo, Discover Cars.
- `ActivityCard`: o texto de ingresso continua compacto, só se `requires_ticket`.
- `PlaceDetailsSheet`: botão fixo **fora** do scroll, só na aba Sobre. Primário GetYourGuide, texto Viator. Some na Comunidade e quando `requires_ticket` é false.
- Offline: o sheet abre; o toque não chama `Linking`.
- Copy nunca diz “Reservar na Tripfy”. Disclaimer no fim do sheet.

## Legal

Redirecionamento, não agência. Sem preço gerado por IA (CDC). Lei do Turismo: a Tripfy não intermedia a hospedagem.

## Relacionados

- [[Geração de Roteiro RF06]]
- [[Detalhe da Viagem RF07]]
- [[Match de Viajantes RF11 RF12]]
- [[changelog]]
