---
title: Gerenciamento de Perfil RF03
tags:
  - rf03
  - lgpd
  - perfil
  - firestore
data_criacao: 2026-07-14
status: ativo
aliases:
  - RF03
  - Editar Perfil
  - Configurações
---

# Gerenciamento de Perfil (RF03)

Perfil com dados reais + estatísticas, edição de foto/nome/bio, edição de "Sua vibe" (com campo livre) e uma área de Configurações (conta, suporte, sair, excluir conta — LGPD / RN01).

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `frontend/src/lib/profile.ts` | `getUserProfile`, `updateUserProfile`, `deleteUserAccount` |
| `frontend/src/app/(tabs)/profile.tsx` | Lê Firestore no `useFocusEffect`; stats; chips da vibe |
| `frontend/src/app/edit-profile.tsx` | Form RHF+Zod (nome/bio), ImagePicker, remover foto |
| `frontend/src/app/edit-vibe.tsx` | Reedita `travel_preferences` (reusa componentes do onboarding) + campo livre |
| `frontend/src/app/settings.tsx` | Conta, notificações (placeholder), suporte, sair, zona de perigo |
| `frontend/src/app/help-support.tsx` | FAQ curto, contato, atalho LGPD |
| `frontend/src/app/companions.tsx` | Lista completa de companheiros (empty até front consumir API) |

## Navegação

```
(tabs)/profile.tsx
 ├─ engrenagem (topo direito)  → /settings
 ├─ avatar                     → /edit-profile
 ├─ "Editar perfil" | "Compartilhar perfil" (50/50)
 │    └─ Compartilhar → Share `tripfy://profile/{uid}` (ver [[Rede de Companheiros]])
 ├─ "Alterar" em Sua vibe      → /edit-vibe
 └─ "Companheiros de viagem >" → /companions

/settings
 ├─ Editar perfil  → /edit-profile
 ├─ Editar vibe    → /edit-vibe
 ├─ Notificações   (desabilitado, badge "Em breve" — sem infra de push ainda)
 ├─ Ajuda & Suporte → /help-support
 ├─ Sair da conta  (confirmação → signOut + limpa store)
 └─ Zona de perigo → excluir conta (LGPD)
```

> [!info] Por que a Zona de Perigo não fica em `edit-profile.tsx`
> `edit-profile.tsx` foca em dados pessoais (foto/nome/bio). Ações de conta
> (sair, excluir) ficam concentradas em `/settings`, seguindo o padrão de
> Settings como área própria (iOS/Android). Evita misturar "editar" com
> "destruir".

### Avatar e CTAs
- Foto ~96pt (próximo do tamanho do perfil do Instagram).
- Dois botões iguais lado a lado (`flex-1`), bordas arredondadas: Editar / Compartilhar.

### Companheiros
- Ordenados por `trips` (quem mais gera roteiro junto).
- Preview no perfil: máx. 4; empty state se lista vazia.
- Lista completa em `/companions` (API `GET /users/me/companions` — ver [[Rede de Companheiros]]).
- Deep link `tripfy://profile/{uid}` → `/profile/[id]` (read-only + CTA add).

### Fix: flash / tela some ao voltar (Android)
Causas comuns: `presentation: "card"` desanexa a tela anterior cedo demais + fundo nativo
brancoco atrás do stack. Fix em `_layout.tsx`:
- Remover `presentation: "card"` das telas push.
- `SystemUI.setBackgroundColorAsync(theme.background)`.
- ThemeProvider com `colors.background` / `card` = tema do app.
- `animationDuration: 280` (iOS; no Android o SO controla — pop nativo já é mais rápido que o push).
- Perfil não dá `setLoading(true)` no refocus (evita apagar conteúdo durante o pop).

## Fluxos

### Salvar perfil (foto/nome/bio)
1. Galeria → `expo-image-picker` (`base64`, quality 0.5, aspect 1:1)
2. `updateProfile` (Auth `displayName`)
3. `setDoc` merge em `users/{uid}`: `name`, `bio`, `photoBase64`
4. "Remover foto": zera o estado local (`photoBase64 = null`, `photoDirty = true`) → `updateUserProfile` recebe `null` e limpa o campo no Firestore.

> [!info] Foto
> `photoBase64` no Firestore (MVP, teto ~700 KB de base64). Auth `photoURL` não
> recebe data URI (limite de tamanho) — só é usado como fallback quando o
> provedor de login (ex. Google) já traz uma foto e o usuário nunca fez upload
> próprio. Upgrade natural: Firebase Storage + `photoURL` (Storage já
> inicializado em `firebase.ts`).

> [!warning] Botão "Cortar" do Android (`expo-image-picker`)
> É UI nativa do cropper interno da lib (`ExpoCropImageActivity`), sem opção
> de customização exposta na API JS (`ImagePickerOptions.kt` não tem campo de
> texto/label). Não há como trocar esse texto sem substituir a lib de crop —
> fora de escopo do MVP.

### Editar "Sua vibe" (`/edit-vibe`)
Reaproveita os componentes do onboarding (`InterestPill`, `PaceCard`,
`CapsuleSelector`, `constants/travel-preferences.ts`), pré-carregados com
`travel_preferences` atual. **Não altera** `(onboarding)/preferences.tsx`.

Novo campo: **"Outras preferências"** (texto livre, opcional, máx. 280
caracteres) — ver [[Preferências Sua Vibe]] para o detalhe do schema
(`other_preferences`) e como isso chega no prompt do LLM.

Salva via `PUT /auth/preferences` (endpoint já existente, sem rota nova).

### Estatísticas no Perfil
| Stat | Fonte |
|------|-------|
| Roteiros criados | `getCountFromServer(users/{uid}/trips)` — Firestore SDK v12, mais leve que buscar todos os docs |
| Salvos | `useWishlistStore((s) => s.items.length)` |
| Matches | Fixo em "Em breve" (card com opacidade reduzida) — RF11/12 ainda não existe; mostrar "0" seria mentir sobre uma feature inexistente |

### Excluir conta (LGPD)
1. Apaga `users/{uid}/trips/*`
2. Apaga `users/{uid}`
3. `auth.currentUser.delete()`
4. `onAuthStateChanged` → login

Fluxo agora vive em `/settings` (antes em `edit-profile.tsx`).

> [!warning] `auth/requires-recent-login`
> Firebase exige login recente para deletar. UI mostra `editProfile.errors.requiresRecentLogin`.

### Sair da conta
Antes não existia nenhum botão de logout no app. `signOut(auth)` em
`/settings` resolve essa lacuna — `onAuthStateChanged` (em `useAuth.ts`) já
reage e o `Stack.Protected` redireciona pro login.

## Ajuda & Suporte (`/help-support`)
FAQ curto (geração por IA, Match, custo, segurança de dados, exclusão de
dados), bloco de direitos LGPD com atalho para a Zona de Perigo, contato via
`mailto:`, e aviso "Política de Privacidade e Termos de Uso — em breve"
(conteúdo legal completo fora de escopo do MVP).

## Fix: flash branco ao navegar (Dark Mode)

`react-native-screens` usa fundo branco padrão durante a transição nativa de
push/pop quando nenhuma tela define `contentStyle`. Fix único em
`app/_layout.tsx`: `contentStyle: { backgroundColor: theme.background }` no
`screenOptions` do `<Stack>` raiz — corrige todas as telas empilhadas
(`edit-profile`, `edit-vibe`, `settings`, `help-support`, `trip-detail`,
`trending`) de uma vez.

## Relacionados

- [[Autenticação Full Stack]] — Auth + sync
- [[Preferências Sua Vibe]] — modelo de `travel_preferences` + `other_preferences`
- [[Detalhe da Viagem RF07]] — trips apagados na exclusão
- [[Rede de Companheiros]] — GET público + POST companions (backend)
