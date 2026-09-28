---
title: Testar Notificações
tags:
  - push
  - teste
  - expo
  - fastapi
data_criacao: 2026-09-27
status: ativo
aliases:
  - Teste de push
---

# Testar notificações

Como conferir o push contextual no aparelho. Arquitetura: [[Notificações Contextuais]]. Build nativo: [[Build iOS EAS iPhone]].

Nada neste guia é segredo. URL, segredo e uid vêm do ambiente da sua máquina. Não cole token, chave ou uid real neste arquivo nem no commit.

## O que precisa estar pronto

- Backend no ar, com `NOTIFICATIONS_CRON_SECRET` no `.env` do backend (não commitar o valor). Sem a variável o endpoint responde 401.
- App de **development build** num aparelho físico. O plugin `expo-notifications` exige um binário novo. Expo Go no Android não recebe push remoto. O switch de Ajustes fica desligado e avisa isso.
- iOS: chave APNs no painel da EAS. Android: credencial FCM v1. Sem isso o backend pode responder `sent: 1` e o celular continua mudo.

No shell, antes dos `curl`:

```bash
export API_URL="http://127.0.0.1:8000"
export NOTIFICATIONS_CRON_SECRET="o-valor-do-seu-env"
export FIREBASE_UID="o-uid-da-conta-de-teste"
```

`API_URL` é o mesmo host do `EXPO_PUBLIC_API_URL`, sem `/api/v1` no final. Os três ficam só na sessão do terminal.

## 1. Registrar o aparelho

No app nativo: **Ajustes → Notificações** e aceite o pedido do sistema.

No Firestore, `users/{uid}` da conta logada deve ter:

- `notifications_enabled: true`
- `push_devices` com um item (`token`, `platform`, `timezone`)

Se o array não aparecer, o passo seguinte não tem destino. Não copie o token para o git, para o chat nem para este arquivo.

## 2. Prova do caminho (suporte)

Não depende do horário do roteiro. É o primeiro teste.

```bash
curl -sS -X POST "$API_URL/internal/notifications/support" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $NOTIFICATIONS_CRON_SECRET" \
  -d "{\"uid\":\"$FIREBASE_UID\"}"
```

Esperado: `{"sent":1}`. O celular mostra “Precisa de ajuda com a viagem? Fale conosco.” O toque abre `/help-support`.

| Resposta | O que olhar |
|---|---|
| `401` | Segredo vazio, diferente do `.env`, ou o processo não foi reiniciado depois de gravar a variável. |
| `{"sent":0}` | Conta sem token, switch desligado, ou uid de outra conta. |
| `{"sent":1}` e nada no celular | Credencial APNs/FCM na EAS, ou o app ainda é Expo Go. |

## 3. As três regras do roteiro

Viagem não apagada, com `start_date` e `end_date` cobrindo hoje. Hora da parada no formato `HH:MM` (texto como “manhã” é ignorado). O tick olha uma janela de 15 minutos no fuso do aparelho.

```bash
curl -sS -X POST "$API_URL/internal/notifications/tick" \
  -H "X-Cron-Secret: $NOTIFICATIONS_CRON_SECRET"
```

Esperado: `{"users":N,"sent":M}`. `sent: 0` na segunda chamada da mesma janela é normal: o envio fica em `notification_sends` e não repete.

| Regra | No roteiro | Quando chamar o tick |
|---|---|---|
| Lembrete | Parada com hora `HH:MM` | Entre 30 e 45 min antes dessa hora |
| Avaliação | A mesma parada marcada feita, com `place_id` | Entre 2 h e 2 h 15 min depois da hora |
| Chuva | Título com praia, mirante, trilha, parque ou praça | Por volta das 07:00 no fuso do celular, se a previsão passar de 60% |

O lembrete e a chuva abrem o dia em `/trip-detail`. A avaliação abre o lugar na aba Comunidade. Sem `place_id`, a avaliação não sai.

Para repetir um teste que já disparou, apague o doc correspondente em `notification_sends` no console do Firebase. Não apague a coleção inteira de produção.
