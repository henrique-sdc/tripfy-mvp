# Match de Viajantes — RF11/RF12

## Escopo implementado

O backend cria e fecha uma sessão colaborativa com até dois usuários
autenticados, combina os dois perfis por Prompt Engineering e transmite o
`ItineraryResponse` via SSE. O app oferece Wizard em dupla, lobby realtime,
convite `tripfy://match/{id}` e entrega o mesmo roteiro aos dois aparelhos.

O fluxo segue [[Geração de Roteiro RF06]] e reutiliza as preferências descritas
em [[Preferências Sua Vibe]]. Nenhuma heurística compara perfis: o RF12 reserva
essa conciliação para Engenharia de Prompt.

## Fluxo HTTP

- `POST /api/v1/matches`: recebe `destination`, `days`, `start_date`, `end_date` e `budget`; cria a sessão
  com o UID autenticado em `participants` e status `waiting`.
- `GET /api/v1/matches/pending`: lista resumos (`id`, `destination`, `days`, `status`, `created_at`)
  das sessões `waiting` onde o UID autenticado é `owner_uid` (Admin SDK; Home banner).
  Rota estática registrada **antes** de `/{match_id}`.
- `POST /api/v1/matches/{match_id}/join`: usa o UID autenticado como convidado,
  adiciona o segundo participante e muda o status para `generating`.
- `GET /api/v1/matches/{match_id}`: antes do join devolve apenas o resumo da
  viagem; participantes recebem a sessão completa.
- `POST /api/v1/matches/{match_id}/generate`: exige dois participantes e status
  `generating`; somente o owner pode iniciar o SSE.
- Todas as rotas exigem Firebase ID Token. Criação/ingresso aceitam 10
  requisições por minuto por IP; geração aceita 5.
- Criador e convidado precisam ter `travel_preferences` preenchido.
- Client Firestore **não** pode `list` em `matches` (rules); listagens passam pelo backend.

## Motor RF12

O Service busca os dois usuários em paralelo e envia os perfis ao
`build_match_prompt`. O Python não compara interesses, calcula afinidade ou
escolhe atividades. O prompt identifica os perfis apenas como viajante 1 e 2,
sem enviar UIDs ao provedor.

O System Prompt instrui o concierge a cruzar interesses e intercalar atividades
quando houver divergências, sem favorecer um participante. O mesmo
`LLMProvider` e o mesmo `ItineraryResponse` do [[Geração de Roteiro RF06]] são
reutilizados. O payload passa por Headroom antes da chamada.

Formato SSE:

```text
data: {"token": "..."}
data: {"done": true}
```

O Repository adquire `generation_lock` em transação antes de chamar o LLM.
Chamadas concorrentes recebem `409` e não geram custo duplicado. O Service
acumula os fragmentos, valida o JSON com `ItineraryResponse` e só então persiste
o roteiro e muda o status para `completed`. Falhas liberam o lock e mantêm
`generating`; um TTL permite recuperar locks deixados por queda do processo.

## Frontend e realtime

O `CreateTripSheet` abre o Wizard existente em modo Match. Após destino, datas (ida/volta, máx. 15 dias) e
orçamento, `createMatch` cria a sala e navega para `/match/[id]`.

No lobby:

- Owner compartilha `tripfy://match/{id}` pela API nativa `Share`.
- Convidado consulta o resumo via API e confirma com `joinMatch`.
- Após o join, ambos observam `matches/{id}` com `onSnapshot`.
- Owner abre o SSE uma vez. O convidado aguarda o `itinerary` persistido.
- Ao chegar `completed`, ambos navegam para `/trip-detail` com o mesmo JSON.
  O auto-save grava `match_id` em `users/{uid}/trips/{tripId}` (metadado, fora
  do schema da LLM). Clone não copia esse campo. A aba Viagens filtra por ele
  ([[Home e Bottom Tabs]]).

A tela usa tokens semânticos, `AppText`, Dark/Light Mode, haptics, reduced
motion e estados inline para convite inválido, sala cheia e falhas de rede.

## Documento Firestore

Coleção: `matches/{match_id}`.

Campos persistidos:

- `destination`: destino validado, de 2 a 120 caracteres.
- `days`: inteiro entre 1 e 15 (contagem inclusiva de `start_date`…`end_date`).
- `start_date` / `end_date`: datas ISO obrigatórias na criação; o prompt usa época/clima.
- `budget`: `economy`, `moderate` ou `premium`.
- `owner_uid`: UID obtido do token, nunca do payload.
- `participants`: UIDs únicos, com o proprietário e no máximo um convidado.
- `status`: `waiting`, `generating` ou `completed`.
- `created_at`: timestamp gerado pelo servidor do Firestore.
- `generation_lock`: token, owner e timestamp do claim single-flight.
- `itinerary`: `ItineraryResponse` validado; nulo antes da conclusão.
- `completed_at`: timestamp do término.

O Repository executa o ingresso em uma transação. Duas pessoas não conseguem
ocupar a segunda vaga ao mesmo tempo. Repetir a aceitação pelo mesmo convidado
é idempotente; o criador não pode aceitar o próprio link.

## Segurança e responsabilidades

O app não escreve na coleção `matches`. As regras permitem `get/listen` somente
quando o UID autenticado já pertence a `participants`; listagem e toda escrita
continuam negadas. O resumo pré-join passa pela API para não abrir a coleção.
O backend valida ID Token, payload, owner, perfil, estado, lock e limite.

Erros esperados:

- `400`: perfil sem preferências.
- `401`: token ausente, inválido ou expirado.
- `403`: usuário autenticado não participa da sessão.
- `404`: usuário sem sync ou sessão inexistente.
- `409`: criador tentou entrar pelo convite, sessão cheia ou indisponível.
- `429`: limite de requisições excedido.
- `503`: provedor de IA indisponível.
- `422`: payload ou `match_id` inválido.

## Arquivos

- `backend/models/match.py`
- `backend/repositories/match_repository.py`
- `backend/services/match_service.py`
- `backend/api/match_router.py`
- `backend/core/prompt_engineering.py`
- `backend/core/sse.py`
- `backend/tests/test_match_model.py`
- `backend/main.py`
- `frontend/src/app/match/[id].tsx`
- `frontend/src/app/wizard/solo.tsx`
- `frontend/src/components/trip/MagicalGenerating.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/locales/pt-BR.json`
- `frontend/app.json`
- `firestore.rules`

## Relacionados

- [[Afiliados RF10]] — `start_date`/`end_date` da sessão vão no stash do roteiro (deep links de OTA).

## Próximo passo

Validar em dois aparelhos: criação, abertura do deep link, join, atualização
realtime e chegada do mesmo roteiro. Reiniciar o Metro após alterar o scheme.
