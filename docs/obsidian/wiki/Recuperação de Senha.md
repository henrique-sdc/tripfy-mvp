---
tags: [auth, rf02, frontend, firebase]
data_criacao: 2026-07-13
status: implementado
---

# Recuperação de Senha (RF02)

Fluxo de reset via Firebase Auth (`sendPasswordResetEmail`). O backend **nunca** participa — só o e-mail do usuário vai ao Firebase, que dispara o link de redefinição.

Relacionado: [[Autenticação Full Stack]], [[Design System Auth]].

## UX

1. Login → link **Esqueci minha senha** (`AuthLink` → `/forgot-password`).
2. Usuário informa e-mail (RHF + Zod).
3. Sucesso: input some com `FadeOut`, mensagem `AppText tone="success"` entra com `FadeIn`, botão fica `disabled`.
4. **Voltar ao login** via `AuthLink`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `(auth)/forgot-password.tsx` | Tela; schema `email` + `sendPasswordResetEmail` |
| `(auth)/login.tsx` | Link para `/forgot-password` |
| `lib/auth-errors.ts` | Mapeia falhas Firebase → i18n |
| `locales/pt-BR.json` | `auth.forgotPassword*` + `auth.errors.emailRequired` |

## Decisões

> [!note] Mesmo padrão do login
> `react-hook-form` + `zod` + `Controller` + `Input`/`Button`/`AppText`. Sem `useState` para o e-mail.

> [!tip] Enumeração de e-mails
> O Firebase costuma retornar sucesso mesmo se o e-mail não existir (anti-enumeration). A copy de sucesso (`forgotPasswordSuccessHint`) reflete isso de propósito.
