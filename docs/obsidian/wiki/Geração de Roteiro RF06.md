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
| `core/llm_provider.py` | `LLMProvider` ABC + `GeminiProvider` |
| `services/trip_service.py` | Orquestra prefs + prompt + stream |
| `api/trip_router.py` | SSE + rate limit + auth |

### Vendor lock-in mitigado (PRD 2.5)

- Interface: `LLMProvider.generate_itinerary_stream(user_prompt) -> AsyncIterator[str]`
- Concreto: `GeminiProvider` · modelo `gemini-3.5-flash`
- SDK: **`google-genai`** (já no requirements; não é o legado `google-generativeai`)
- Service **não** importa `google.genai`
- Troca futura (OpenAI): nova classe + factory — router/service intactos

### Structured Output

Gemini força o schema via:

- `response_mime_type="application/json"`
- `response_schema=ItineraryResponse`

Schema de resposta:

- `ActivityResponse` — `time`, `title`, `description`, `location`
- `ItineraryDayResponse` — `day`, `title`, `activities[]`
- `ItineraryResponse` — `destination`, `summary`, `days[]`

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

User prompt passa por `headroom.compress` antes do Gemini (custo de tokens).

## Frontend

| Arquivo | Papel |
|---------|-------|
| `lib/api.ts` | `generateTripStream` (`react-native-sse`, POST + Bearer) |
| `app/wizard/solo.tsx` | Form RF05 + `MagicalGenerating` + chama o stream |
| `app/trip-detail.tsx` | Renderiza o JSON (`params.itinerary`) |
| `locales/pt-BR.json` | `wizard.generating.*`, `tripDetail.*` |

Fluxo UX: formulário → loading mágico (sparkles + texto pulsante) → `done` → `router.replace('/trip-detail')`.

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
