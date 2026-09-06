---
title: Tripfy Pro e Paywall
tags:
  - premium
  - paywall
  - monetizacao
  - tcc
data_criacao: 2026-09-05
status: ativo
aliases:
  - Tripfy Pro
  - Paywall
  - Freemium
---

# Tripfy Pro e Paywall (mock TCC)

Demonstra o Freemium da banca **sem** StoreKit/Play Billing. Geração por IA continua livre (PRD 1.4 / 1.6). O teto Free é **2 viagens ativas** (`deleted_at == null`).

Relacionado: [[Autenticação Full Stack]], [[Detalhe da Viagem RF07]], [[Gerenciamento de Perfil RF03]], [[Geração de Roteiro RF06]].

## O que o gate cobre

| Ação | Gate? |
| --- | --- |
| `POST /trips/generate` e Match generate | Não — IA nunca é paywall |
| `POST /trips` (create) | Sim |
| `POST /trips/{id}/clone` | Sim |
| `POST /trips/{id}/restore` | Sim |
| Update / soft-delete no client | Não |
| Match 3+ | Fora — join já fecha em 2 (`409`). Copy “Em breve” no paywall |
| Exportação offline | Só copy no paywall |

## Modelo — `users/{uid}`

```
tier: "free" | "pro"          # default free (docs antigos)
premium_until: timestamp | null
```

`is_premium` **não** é gravado. Derivado em `entitlement_service.is_premium_effective`:

- `pro` + `premium_until` nulo → Pro vitalício (ok no mock)
- `pro` + `until` no futuro → Pro
- resto, inclusive Pro expirado → Free

Não entra em `UserPublicProfile` (LGPD).

`POST /auth/sync` devolve `is_premium`, `tier`, `premium_until` junto com `has_preferences`.

## Por que o create passou a ser API

O auto-save antigo gravava `users/{uid}/trips` pelo **client SDK**. Bloquear só clone/restore no FastAPI não segurava o Free.

Agora:

1. Viagem **nova** → `POST /api/v1/trips` (Admin SDK) depois do entitlement.
2. **Update** RF07 continua no client (`saveTrip` com `tripId`).
3. Rules: `create` de trip = `false`. Client não zera `deleted_at` (restore só via API). Client não escreve `tier` / `premium_until`.

## HTTP 402

Estouro do teto:

```json
{
  "detail": {
    "code": "premium_required",
    "reason": "active_trip_limit",
    "limit": 2,
    "current": 2
  }
}
```

Não usamos 403: o Match já devolve 403 (“só o criador gera”). O interceptor em `lib/api.ts` só abre o paywall em `code === "premium_required"` ou status 402.

## Checkout mock

| Rota | Efeito |
| --- | --- |
| `POST /api/v1/checkout/upgrade` | `tier=pro`, `premium_until=now+365d`, devolve o mesmo shape do sync |
| `POST /api/v1/checkout/cancel` | `tier=free`, `premium_until=null`. Viagens já salvas ficam |

`CHECKOUT_MOCK_ENABLED` (default `true`). Troca futura: este router vira adapter de IAP; o entitlement não muda.

## Frontend

- `authStore`: `isPremium`, `tier`, `premiumUntil` via `applySync` no `useAuth`.
- `usePaywallStore` + overlay `PaywallScreen` no `_layout` (irmão do CreateTripSheet).
- CreateTripSheet conta ativas no client (UX). Backend continua soberano.
- Auto-save no detail: 402 não entra em loop de Alert; depois do upgrade tenta gravar de novo.
- Configurações: row Tripfy Pro (abrir paywall / cancelar simulação). Perfil: chip Pro.


- Tema: `useTheme()` (Light e Dark). Halo `accent → background`. CTA no accent com texto branco (`Colors.light.buttonText`) — o `buttonText` do dark é preto e some no roxo.

## Deploy

Publicar `firestore.rules` no projeto Firebase. Sem isso o client ainda cria viagem e o teto vira teatro.
