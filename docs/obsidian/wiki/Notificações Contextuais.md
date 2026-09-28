---
title: Notificações Contextuais
tags:
  - push
  - expo
  - fastapi
  - lgpd
data_criacao: 2026-09-27
status: ativo
aliases:
  - Push
  - Lembretes do roteiro
---

# Notificações contextuais

Lembrete, avaliação e chuva saem do roteiro já salvo. Sem GPS em background. O relógio não mora dentro do processo do FastAPI: um cron externo chama `POST /internal/notifications/tick` a cada 15 minutos.

Relacionado: [[Detalhe da Viagem RF07]], [[Modo Viagem]], [[Gerenciamento de Perfil RF03]], [[Build iOS EAS iPhone]]. Como conferir no aparelho: [[Testar Notificações]].

## Token

- O app pede permissão depois que um roteiro fica salvo, ou no switch de Ajustes. Nunca no boot.
- `PUT /api/v1/me/push-token` grava em `users/{uid}.push_devices` (token, `ios`|`android`, fuso IANA). Teto de 5 aparelhos.
- `DELETE /api/v1/me/push-token` no logout e quando o switch desliga. Sem devices, `notifications_enabled` volta a false.
- O client não escreve esses campos. Ver `firestore.rules`. O perfil público não devolve o token.

O horário `09:00` da parada é o relógio do aparelho — o mesmo número da tela. O fuso vai no registro e é atualizado quando o app volta ao primeiro plano.

## Tick

Header `X-Cron-Secret` = `NOTIFICATIONS_CRON_SECRET` no `.env` do backend. Vazio recusa. `EXPO_ACCESS_TOKEN` é opcional.

Janela de 15 minutos. Se o cron atrasar, o lookback sobe até 45. Cada envio grava `notification_sends/{chave}` para não repetir.

1. **Lembrete** — 30 min antes de `time` (`HH:MM`). Texto que não for hora é ignorado.
2. **Avaliação** — 2 h depois, só com `completed` e `place_id`. A aba Comunidade não abre sem esse id.
3. **Chuva** — 07:00 no fuso do aparelho, uma vez por viagem por dia. Coordenada da parada ou geocoding do destino (Open-Meteo, sem GPS da pessoa). Título com praia, mirante, trilha, parque ou praça e chance de chuva ≥ 60%. O corpo manda abrir o dia. Sem LLM.

Viagem conjunta: o ponteiro do convidado não tem `days`. A regra lê o doc do dono e avisa cada um no próprio fuso.

`POST /internal/notifications/support` com `{ "uid" }` e o mesmo segredo manda “Fale conosco” para `/help-support`. Não entra no cron.

## Toque

Um listener no root. `data.url` é path do Expo Router (`/trip-detail?...` ou `/help-support`), sem `tripfy://`. Avaliação abre o [[Detalhe da Viagem RF07]] com o `PlaceDetailsSheet` na aba Comunidade.

Push remoto exige development build (EAS) e aparelho físico. No Expo Go Android o módulo nem é importado — o import estoura desde o SDK 53 e derrubava o app. O plugin `expo-notifications` pede rebuild. iOS: chave APNs na EAS. Android: credencial FCM v1 e o canal `roteiro`.

## Cron de exemplo

```bash
curl -X POST "$API/internal/notifications/tick" \
  -H "X-Cron-Secret: $NOTIFICATIONS_CRON_SECRET"
```

GitHub Actions `schedule`, cron-job.org ou, no GCP, Cloud Scheduler. A regra não muda.
