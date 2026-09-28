---
title: Deslocamento e Alternativas
tags:
  - rf06
  - rf07
  - maps
  - places
data_criacao: 2026-09-28
status: ativo
aliases:
  - Routes API
  - Sugestões próximas
---

# Deslocamento real e alternativas próximas

O LLM continua estimando o deslocamento na `description` ([[Geração de Roteiro RF06]]). O número que a banca vê no badge — tempo e distância — vem do Google, no proxy que já guarda `GOOGLE_MAPS_API_KEY`. Primeiro a Routes API. Se o projeto não a habilitou (403), cai na **Directions API** clássica, a que o PRD já cita. O cálculo mede o intervalo entre paradas que a IA já gerou. Não reescreve o roteiro.

Fora do stream. Não grava perna no Firestore nem no pin de [[Modo Offline]]. Trocar uma parada usa Places Nearby, filtrada pela vibe.

## Deslocamento

```
POST /api/v1/routes/calculate
Authorization: Bearer <Firebase ID Token>
```

Corpo: `travel_mode` (`walking` | `public_transit` | `ride_hail`) e `stops` (2 a 8 pontos, na ordem do dia).

Resposta: `legs[]` com `distance_meters` e `duration_seconds`. Um a menos que `stops`. O app formata `15 min · 1,2 km` (i18n). Sem texto pronto no JSON.

| Modo do perfil | Routes API |
| --- | --- |
| `walking` | `WALK` |
| `public_transit` | `TRANSIT` (uma chamada por perna, partida = agora — a API não aceita parada intermediária) |
| `ride_hail` | `DRIVE` + `TRAFFIC_UNAWARE` |

Vários modos no perfil: a pé, senão transporte, senão carro. Lista vazia: a pé. O client manda o modo; o backend não relê o Firestore.

- Field mask: `routes.legs.distanceMeters,routes.legs.duration`
- Par a menos de 40 m: haversine, sem HTTP
- Cache no processo, 12 h, chave com coordenada arredondada a 5 casas. Teto de um worker
- Rate limit `20/minute`. Loga uid e quantidade de paradas, não a coordenada
- `503` sem chave, `502` falha Google, `504` timeout

Na UI, o `RouteConnector` fica entre os cards, inclusive na vista Todos (não cruza de um dia para o outro). Debounce ~300 ms. Cache de sessão em `lib/api.ts`. Sem rede não dispara o POST; o badge só permanece se aquele par já foi calculado nesta sessão.

## Alternativas

```
GET /api/v1/places/nearby?lat=&lng=&travel_mode=&interests=
```

Declarado antes de `/{place_id}/…`. Places (New) `searchNearby`, fallback legacy no 403.

- Raio no servidor: 1,2 km a pé; 2,5 km de carro ou transporte
- No máximo 5 tipos e 8 lugares, ordenados por distância
- Field mask sem foto nem nota: `places.id,places.displayName,places.primaryTypeDisplayName,places.location`
- Rate limit `10/minute`

| Interesse | Tipo Places |
| --- | --- |
| `art_museums` | museum, art_gallery |
| `cafes` | cafe |
| `street_food`, `fine_dining` | restaurant |
| `bars`, `nightlife` | bar |
| `history_architecture` | historical_landmark |
| `shopping` | shopping_mall |
| `wellness` | spa |
| demais / vazio | tourist_attraction |

A distância de cada linha é haversine no client (não cobra outra chamada). O que já está no dia sai da lista.

Gatilho: botão **Sugestões** no título do dia, só em planejar com edição liberada. Apagar uma parada não abre o sheet; a âncora passa a ser o ponto removido até abrir as sugestões ou trocar de dia. Sem isso, a âncora é a última parada do dia com coordenada. **Adicionar ao roteiro** reusa a parada nova e grava o `place_id`.

## Google Cloud

Na mesma key do Places, habilitar **Routes API**. Sem isso o badge não aparece (`502`/`503`).

## Relacionados

- [[Geração de Roteiro RF06]] — a frase da IA na descrição continua
- [[Detalhe da Viagem RF07]] — card, dia e sheet
- [[Preferências Sua Vibe]] — `transport_modes` e `interests`
- [[Modo Offline]] — pernas e sugestões ficam de fora do pin
