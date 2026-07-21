---
title: Geração de Roteiro RF06
tags:
  - rf06
  - ia
  - gemini
  - sse
  - backend
  - frontend
data_criacao: 2026-07-14
status: ativo
aliases:
  - RF06
  - Geração de Roteiro
  - LLM Provider
---

# Geração de Roteiro por IA (RF06)

Missão 6: endpoint de geração com LLM trocável, Structured Output, streaming SSE e Wizard Solo consumindo o stream.

> [!info] Escopo deste commit
> Backend (cérebro) + Frontend (consumidor SSE + UX mágica + `/trip-detail`).
> Google Maps HTTP **não** entra neste commit — estimativa de deslocamento fica no prompt (`description`).

## Endpoint

`POST /api/v1/trips/generate`

| Aspecto | Valor |
|---------|--------|
| Auth | Bearer Firebase (`get_current_user`) |
| Rate limit | `5/minute` por IP (slowapi) |
| Media type | `text/event-stream` |

### Body (`GenerateTripRequest`)

| Campo | Tipo | Origem |
|-------|------|--------|
| `destination` | string (2–120) | Frontend |
| `days` | int (1–30) | Frontend |
| `budget` | `economy` \| `moderate` \| `premium` | Frontend |
| `notes` | string (≤1000) | Frontend |

> [!warning] Backend is the Source of Truth (PRD 6.2)
> O frontend **não** envia `interests`, `pace`, `transport_modes`, `dietary_style`.
> O Service busca `travel_preferences` no Firestore pelo UID.

### Formato SSE

```
data: {"token": "..."}\n\n
data: {"done": true}\n\n
```

Em erro mid-stream: `{"error": "Falha ao gerar roteiro."}`.

Os `token`s são **fragmentos de JSON**. O app **acumula** a string e só faz `JSON.parse` no `done` (não parseia partial JSON a cada chunk).

## Arquitetura Clean

```
Router (trip_router)
  → Service (trip_service)
    → user_repository (Firestore prefs)
    → prompt_engineering + headroom.compress
    → LLMProvider.generate_itinerary_stream
```

| Arquivo | Papel |
|---------|-------|
| `models/trip.py` | Request + `ActivityResponse` / `ItineraryDayResponse` / `ItineraryResponse` |
| `core/prompt_engineering.py` | System Prompt anti-injection + user prompt delimitado |
| `core/llm_provider.py` | `LLMProvider` ABC + `OpenAIProvider` / `GeminiProvider` |
| `core/sse.py` | Empacotamento SSE compartilhado pelas gerações Solo e Match |
| `services/trip_service.py` | Orquestra prefs + prompt + stream |
| `api/trip_router.py` | SSE + rate limit + auth |

### Vendor lock-in mitigado (PRD 2.5)

- Interface: `LLMProvider.generate_itinerary_stream(user_prompt) -> AsyncIterator[str]`
- Concretos: `OpenAIProvider` · `GeminiProvider`
- Troca via `.env`: `LLM_PROVIDER=openai|gemini` (factory em `get_llm_provider`)
- Modelos: `OPENAI_MODEL` (default `gpt-4o-mini`) · `GEMINI_MODEL`
- SDKs: `openai` / `google-genai` — só dentro de `llm_provider.py`
- Service **não** importa SDK de vendor

### Structured Output
- **OpenAI:** schema com propriedades obrigatórias `day_1`…`day_N` (OpenAI **não** aplica `minItems` em arrays). O provider acumula o stream, converte para `ItineraryResponse.days[]` e emite o JSON canônico. `max_tokens=16384`.
- **Gemini:** `response_mime_type=application/json` + `response_schema=ItineraryResponse` (array `days` direto).

> [!warning] Por que day_1…day_N?
> Com array + `strict`, o GPT fechava JSON válido com **1 dia lotado**. Propriedades nomeadas no `required` forçam os N dias.

Schema canônico (após conversão OpenAI / nativo Gemini):

- `ActivityResponse` — `time`, `title`, `description`, `location`, `latitude?`, `longitude?`
- `ItineraryDayResponse` — `day`, `title`, `activities[]`
- `ItineraryResponse` — `destination`, `summary`, `days[]` (exatamente N dias do pedido)

### Prompt Injection (PRD 6.2)

System Prompt = Concierge Digital + trava explícita anti-jailbreak.
Dados do usuário em `<perfil_viajante>` / `<parametros_viagem>` após `sanitize_user_text`.
Sem Markdown na resposta — só JSON do schema.

### Deslocamento (RF06.1 — fase prompt)

> [!todo] Maps HTTP adiado
> Sem chamada Google Maps no stream (não bloqueia TTFT).
> A IA estima tempo/meio na `description` com base em `transport_modes`.
> Distância exata → app/Maps depois.

### Headroom

User prompt passa por `headroom.compress` antes do LLM (custo de tokens).

## Frontend
| Arquivo | Papel |
|---------|-------|
| `lib/api.ts` | `generateTripStream` (`react-native-sse`, POST + Bearer) |
| `lib/pendingItinerary.ts` | Stash em memória do JSON (evita truncar na URL do Expo Router) |
| `app/wizard/solo.tsx` | Form RF05 + `MagicalGenerating` + chama o stream |
| `app/trip-detail.tsx` | Consome stash / `tripId`; chips **Todos** + Dia N |
| `locales/pt-BR.json` | `wizard.generating.*`, `tripDetail.*` |

Fluxo UX: formulário → loading mágico → `done` → `stashPendingItinerary` → `router.replace('/trip-detail')`.

Erros tratados: `401`, `429`, `503`, rede — Alert amigável + fecha o EventSource.

## Pré-requisitos de runtime

1. `GEMINI_API_KEY` no `.env` do backend
2. `EXPO_PUBLIC_API_URL` no frontend (IP da máquina no device físico)
3. Usuário com `travel_preferences` (senão 400)
4. Doc Firestore do user (senão 404 — `/auth/sync`)

## Relacionados

- [[Autenticação Full Stack]] — sync + preferências
- [[Preferências Sua Vibe]] — modelo de perfil que alimenta o prompt
- [[Home e Bottom Tabs]] — Wizard Solo (RF05) e navegação
- [[Match de Viajantes RF11 RF12]] — dois perfis no mesmo Structured Output/SSE
## Structured Output
### Coordenadas (mapa)

`ActivityResponse` inclui `latitude` / `longitude` opcionais (`float | null`). O prompt pede estimativa WGS84; null se incerto. Consumido em [[Detalhe da Viagem RF07]].

### Observabilidade

No fim do stream (`done`), o router loga o JSON acumulado com UID. Frontend espelha com `console.info("[LLM Response]")` após o parse.
