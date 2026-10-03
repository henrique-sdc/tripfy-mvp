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

Depois do [[Match de Viajantes RF11 RF12]], os dois viajantes editam **um** roteiro. O que um apaga, reordena ou renomeia aparece no outro via `onSnapshot`. Viagem solo segue no auto-save de 700 ms até alguém aceitar o convite de edição. O link de leitura (`appDeepLink(/trip/{id})`) continua visita só leitura + clonar ([[Detalhe da Viagem RF07]]).

## Por que um documento só

O roteiro cabe num doc (`users/{ownerUid}/trips/{tripId}`, teto de 15 dias). O Firestore cobra por documento, não por campo. Subcoleção de parada aumentaria a leitura da abertura e o reorder. O gesto de arrastar **não** vai pra rede: um frame a 120 fps seria centenas de writes. A op sai no `onDragEnd`.

ponytail: se um doc passar de ~400 KB, aí sim `activities/{id}` vira subcoleção. Não agora.

## Sala

1. **Doc canônico** no dono, com `member_uids` (máx. 2), `collab: true`, `revision` e `activity.id` estável (não deriva de título nem índice).
2. **Ponteiro** `users/{guestUid}/trips/{tripId}` sem `days` (`role: "member"`, `day_count`). A Home do convidado lista a viagem. O ponteiro **não** conta no teto Free. Clone continua contando.
3. **Árbitro** `POST /api/v1/trips/{id}/ops`. O client não escreve o miolo quando `collab` está ligado (`firestore.rules`).
4. **Presença** no Realtime Database (`presence/{tripId}/{uid}`), com `onDisconnect`. Sem URL (`FIREBASE_DATABASE_URL` / `EXPO_PUBLIC_FIREBASE_DATABASE_URL`), a edição segue e os avatares somem. Regras em `database.rules.json`.

O convidado escuta o doc do dono. Sem `firebase deploy --only firestore:rules`, o SDK recusa a leitura e o app faz poll em `GET /trips/{id}` a cada 2 s. Com as regras no ar, o `onSnapshot` é o caminho principal.

Quando o snapshot chega e a revisão não é sua, uma faixa some sozinha: "Ana alterou o título", "Ana reordenou o Dia 2". Debaixo do título, "Ana editou agora" / "há 2 h" só aparece se a outra pessoa editou. No roteiro solo essa linha não existe.

O mesmo rótulo entra em `change_log` no doc canônico (teto 40, `{ by, kind, day, at_ms }`). A frase continua no app. O balão Salvo abre a lista, do mais novo para o mais antigo. Sozinho não mostra a faixa: o auto-save só acrescenta a linha no mesmo `setDoc`. Sem snapshot antigo e sem desfazer. Repetir o mesmo rótulo em menos de 2 min só atualiza a hora. O ponteiro do convidado e o cartão do Explorar não copiam o campo.

No complete do Match o backend cria a viagem canônica e grava `trip_id` em `matches/{id}`. Os dois abrem esse id. Match antigo, sem `trip_id`, ainda cai na cópia local.

## Convite numa viagem Solo

O dono abre o sheet no ícone de compartilhar ([[Detalhe da Viagem RF07]]). Três intenções, dois segredos:

1. **Editar** — `POST /api/v1/trips/{id}/invites` devolve um token (`secrets.token_urlsafe`). O Firestore guarda só o sha256 em `trip_invites/{hash}` (`trip_id`, `owner_uid`, `expires_at` de 7 dias). O link é `appDeepLink(/join/{token})`. Rotacionar apaga o hash anterior.
2. **Cópia** — o link de leitura que já existia. Quem abre clona. O id da viagem não entra na sala.
3. **Explorar** — ver [[Home e Bottom Tabs]].

`/trip/{id}/join` não existe de propósito: quem tem o link de leitura (ou achou a viagem no feed) não vira editor só acrescentando um sufixo.

A tela `/join/[token]` pede o preview (`GET /trips/invites/{token}`: nome, destino, título, dias — sem `days` nem notas) e confirma com `POST /trips/{id}/invite/accept`. A transação chama `decide_join` (teto dono + 1, igual ao Match grátis):

- dono ou quem já está na lista: 200, e recria o ponteiro se ele sumiu
- sala cheia: 409 `trip_full`
- senão: `collab: true`, `member_uids`, `revision` se faltava, ids de parada se faltavam, ponteiro sem `days`, presença

A op seguinte do convidado passa no mesmo árbitro. O client não escreve `collab` nem `member_uids`. Com a tela do dono aberta, um `onSnapshot` curto vê `collab` virar true e liga o hook que já existia. Um auto-save solo no ar nesse instante pode tomar permission-denied; o app relê pela API.

O token continua válido até expirar ou o dono gerar outro. O segundo aceitante esbarra no teto.

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
- `backend/services/trip_invite.py` — `decide_join`, testado em `backend/tests/test_trip_invite.py`
- `backend/repositories/trips_repository.py` — transação + ponteiro + aceite
- `backend/api/trip_router.py` — `POST /{trip_id}/ops`, convite e publish
- `frontend/src/app/join/[token].tsx`
- `frontend/src/components/trip/ShareTripSheet.tsx`
- `frontend/src/hooks/use-collab-trip.ts`
- `frontend/src/hooks/use-trip-presence.ts`
- `frontend/src/lib/collabQueue.ts`
- `firestore.rules` e `database.rules.json`
