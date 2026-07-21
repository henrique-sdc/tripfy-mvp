---
title: Rede de Companheiros
tags:
  - companheiros
  - perfil
  - lgpd
  - rf03
data_criacao: 2026-07-21
status: ativo
aliases:
  - Companheiros
  - Perfil Público
---

# Rede de Companheiros

Lista **mútua** de UIDs em `users/{uid}.companions` (batch ArrayUnion/ArrayRemove nos dois lados). Quando B aceita o link de A, os dois passam a ver um ao outro. O client escuta o próprio doc (`onSnapshot`) e re-hidrata via API.

## Endpoints

| Método | Path | Limite | Resposta |
|--------|------|--------|----------|
| `GET` | `/api/v1/users/{uid}/public` | 30/min | `UserPublicProfile` (404 se sumir) |
| `GET` | `/api/v1/users/me/companions` | 30/min | lista hidratada de `UserPublicProfile` |
| `POST` | `/api/v1/users/me/companions/{uid}` | 20/min | 204; 400 self-add; 404 alvo inexistente |
| `DELETE` | `/api/v1/users/me/companions/{uid}` | 20/min | 204 (ArrayRemove, idempotente) |

Auth obrigatória. Inserção via `ArrayUnion` (atômica, sem duplicata).

## Contrato público (`UserPublicProfile`)

Inclui: `uid`, `name`, `bio`, `photoBase64`, `interests`, `pace`.

**Nunca** inclui: `email`, `created_at`, `companions`, budget, dieta, `other_preferences`.

## Front (Passo 2)

| Fluxo | Comportamento |
|-------|----------------|
| Compartilhar | `Share` com `tripfy://profile/{uid}` em `(tabs)/profile` |
| Deep link | `app/profile/[id].tsx` — foto, nome, bio, vibe read-only |
| CTA | "Adicionar aos Companheiros" → `POST …/me/companions/{uid}` |
| Lista | Preview no perfil + `/companions` via `GET …/me/companions` |

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `backend/models/user.py` | `UserInDB` + `UserPublicProfile` |
| `backend/repositories/user_repository.py` | public profile, ArrayUnion, list hidratada |
| `backend/services/user_service.py` | 404/400 + logs |
| `backend/api/user_router.py` | Rotas + rate limit |
| `frontend/src/lib/api.ts` | `getPublicProfile`, `addCompanion`, `listMyCompanions` |
| `frontend/src/app/profile/[id].tsx` | Perfil público + CTA |
| `frontend/src/app/(tabs)/profile.tsx` | Share + preview |
| `frontend/src/app/companions.tsx` | Lista completa |

## Ainda fora

- Picker de companheiros no fluxo de Match
- Auto-popular após Match concluído
- Contagem de "roteiros em comum"

## Relacionados

- [[Gerenciamento de Perfil RF03]]
- [[Match de Viajantes RF11 RF12]]
- [[Autenticação Full Stack]]
