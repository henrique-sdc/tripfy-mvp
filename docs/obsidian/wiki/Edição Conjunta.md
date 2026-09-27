---
title: Edição Conjunta
tags:
  - rf12
  - firestore
  - realtime
  - match
data_criacao: 2026-09-21
status: ativo
aliases:
  - Sala de edição
  - Collab
---

# Edição Conjunta

Depois do [[Match de Viajantes RF11 RF12]], os dois viajantes editam **um** roteiro. O que um apaga, reordena ou renomeia aparece no outro via `onSnapshot`. Viagem solo continua no auto-save de 700 ms. O link `tripfy://trip/{id}` continua visita só leitura + clonar ([[Detalhe da Viagem RF07]]).

## Por que um documento só

O roteiro cabe num doc (`users/{ownerUid}/trips/{tripId}`, teto de 15 dias). O Firestore cobra por documento, não por campo. Subcoleção de parada aumentaria a leitura da abertura e o reorder. O gesto de arrastar **não** vai pra rede: um frame a 120 fps seria centenas de writes. A op sai no `onDragEnd`.

ponytail: se um doc passar de ~400 KB, aí sim `activities/{id}` vira subcoleção. Não agora.

## Sala

1. **Doc canônico** no dono, com `member_uids` (máx. 2), `collab: true`, `revision` e `activity.id` estável (não deriva de título nem índice).
2. **Ponteiro** `users/{guestUid}/trips/{tripId}` sem `days` (`role: "member"`, `day_count`). A Home do convidado lista a viagem. O ponteiro **não** conta no teto Free. Clone continua contando.
3. **Árbitro** `POST /api/v1/trips/{id}/ops`. O client não escreve o miolo quando `collab` está ligado (`firestore.rules`).
4. **Presença** no Realtime Database (`presence/{tripId}/{uid}`), com `onDisconnect`. Sem URL (`FIREBASE_DATABASE_URL` / `EXPO_PUBLIC_FIREBASE_DATABASE_URL`), a edição segue e os avatares somem. Regras em `database.rules.json`.

O convidado escuta o doc do dono. Sem `firebase deploy --only firestore:rules`, o SDK recusa a leitura e o app faz poll em `GET /trips/{id}` a cada 2 s. Com as regras no ar, o `onSnapshot` é o caminho principal.

Quando o snapshot chega e a revisão não é sua, uma faixa some sozinha: "Ana alterou o título", "Ana reordenou o Dia 2". Debaixo do título fica "Ana editou agora" / "há 2 h", usando `updated_by_name` e `last_change` gravados na op. Sem linha do tempo.

No complete do Match o backend cria a viagem canônica e grava `trip_id` em `matches/{id}`. Os dois abrem esse id. Match antigo, sem `trip_id`, ainda cai na cópia local.

## Conflito

Cada op leva `op_id` e `base_revision`. A transação aplica e incrementa `revision`. `op_id` repetido não aplica de novo.

- Patch de parada e reorder **comutam**: ordem não apaga título, título não desfaz ordem.
- Reorder manda ids. Id que o outro apagou sai. Id que o outro criou fica na posição relativa.
- Delete contra patch da mesma parada: quem apagou primeiro ganha. O patch volta **409** `activity_deleted` e **não** recria a parada.
- Duas metas ao mesmo tempo (notas contra notas) também voltam 409. A tela adota o doc do servidor.

## Drag

`DraggableFlatList` segue local. Enquanto `dragging`, o snapshot fica numa fila e não troca o `data` da lista. No drop, uma op `reorder_day`. Texto de meta/título espera 700 ms. Eco da própria op não remonta a lista.

## Presença

Bolinhas no cabeçalho (slot reservado, pra lista não pular) e anel de 2 px no card que a outra pessoa está editando. Foco muda quando o modal abre, não a cada tecla. Queda de rede: o `onDisconnect` apaga o nó; em queda suja o Firebase pode levar dezenas de segundos.

Notas, na sala, são **notas da viagem**. E-mail e preferências de perfil não entram no doc nem na presença — só nome e foto http.

## Arquivos

- `backend/services/trip_ops.py` — ops puras, testadas em `backend/tests/test_trip_ops.py`
- `backend/repositories/trips_repository.py` — transação + ponteiro
- `backend/api/trip_router.py` — `POST /{trip_id}/ops`
- `frontend/src/hooks/use-collab-trip.ts`
- `frontend/src/hooks/use-trip-presence.ts`
- `frontend/src/lib/collabQueue.ts`
- `firestore.rules` e `database.rules.json`
