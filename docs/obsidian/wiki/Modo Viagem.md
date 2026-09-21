---
title: Modo Viagem
tags:
  - rf07
  - modo-viagem
  - reviews
  - firestore
data_criacao: 2026-09-06
status: ativo
aliases:
  - Travel Mode
  - Assistente de campo
---

# Modo Viagem (assistente de campo)

Extensão de [[Detalhe da Viagem RF07]] + relacionamento do BMC (“lembretes durante a viagem, avaliações pós-viagem”). **Não é um RF novo.**

O detalhe do roteiro tem dois chromes, um de cada vez:

| Modo | Job | Chrome |
| --- | --- | --- |
| **Planejar** | Montar o roteiro | Lápis, drag, swipe, FAB, +Dia |
| **Viajar** | Executar no campo | Checkbox “feito”, navegar no mapa nativo |

Toggle: `CapsuleSelector` compacto acima dos chips de dia. **Não persiste** — cada abertura recalcula o default.

## Default pelas datas

Helper `isOnOrAfterTripStart` em `frontend/src/lib/tripDates.ts`:

- sem `start_date` → Planejar
- hoje `< start_date` → Planejar
- hoje `>= start_date` → Viajar (durante **e** depois da viagem, senão a trava impede o pós-viagem)

O usuário troca na hora (`chromeTouchedRef`).

## Persistência (`completed` + `place_id`)

**Não** entram no `response_schema` do Gemini (`ActivityResponse`). Vivem em `PersistedActivity`.

- Autosave continua reescrevendo o `days[]` inteiro (`setDoc` merge). Firestore cobra por documento, não por campo; PATCH de índice no array quebra no drag.
- Checkbox faz **flush imediato** (`persistNowRef`, debounce 0) pra o POST de review não tomar 403.
- `place_id` só é carimbado no “feito” (lookup do card). Lookup no mount **não** suja o doc.
- Clone (`_itinerary_payload(..., reset_completed=True)`): zera `completed`, conserva `place_id`.
- Visitante `readOnly`: navega; não marca feito.

## Trava de Ouro (reviews)

O usuário só **cria** avaliação de um `place_id` se alguma parada ativa dele estiver `completed && place_id`.

- UI: `PlaceDetailsSheet` recebe `canWriteReview` do pai (`hasCompletedPlace`). Review já existente continua editável.
- API: `POST /places/{place_id}/reviews` — se não há review próprio, `list_active` + `user_has_completed_place`; senão **403**. `DELETE` livre.
- Visitante de roteiro compartilhado: a trava olha as **viagens do avaliador**, não o checklist do dono.

## Navegação nativa

`frontend/src/lib/openNativeMaps.ts` via `Linking.openURL` (sem `react-native-maps`):

- iOS: `http://maps.apple.com/?daddr=lat,lng`
- Android/web: Google Maps `dir` / `search` se não houver coords

## Relacionados

- [[Detalhe da Viagem RF07]] — lista, Places, sheet, autosave
- [[Afiliados RF10]] — `start_date` / `end_date` no doc
