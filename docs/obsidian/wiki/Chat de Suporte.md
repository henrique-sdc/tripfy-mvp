---
title: Chat de Suporte
tags:
  - ia
  - sse
  - suporte
data_criacao: 2026-10-03
status: ativo
---

# Chat de Suporte

Pedido do TCC: chatbot para dúvidas rápidas. Fora do RF01–RF12. A FAQ estática descrita em [[Gerenciamento de Perfil RF03]] continua na mesma tela. O chat é um atalho.

> [!info] Sem banco vetorial
> A base é `backend/knowledge/support_kb.md`, relida a cada pergunta e colada no system prompt. A conversa não vai para o Firestore: ao sair da tela, ela some. Cada envio manda de novo o histórico visível, até 8 mensagens. O bot não vê as viagens da pessoa.

A base inclui a [[Afiliados RF10|Central de Reservas]]: o app redireciona (Booking, Airbnb, Skyscanner e o resto) e não conclui a reserva.

## Entrada

Em `/help-support`, o bloco "Fale com a gente" abre `/support-chat` pelo CTA "Falar com nosso Assistente de IA". O `mailto:` permanece abaixo.

A lista é uma `FlatList` invertida. O balão da IA cresce a cada token. O campo fica no rodapé, com `KeyboardAvoidingView` no iOS (`padding`) e resize nativo no Android.

## Endpoint

`POST /api/v1/support/chat`

| Aspecto | Valor |
|---------|--------|
| Auth | Bearer Firebase (`get_current_user`) |
| Rate limit | `10/minute` por IP (slowapi) |
| Media type | `text/event-stream` |
| Histórico | 1 a 8 mensagens, `user` ou `assistant` |
| Texto | até 800 caracteres por mensagem, 4000 no total |
| Última mensagem | obrigatoriamente `user` |

`role: system` no body é 422. O system prompt é só do servidor.

Os eventos são os mesmos da [[Geração de Roteiro RF06]]: `{token}`, `{done: true}`, `{error}`. O app não faz parse de JSON nesse fluxo.

## Motor

`LLMProvider.stream_support` devolve texto livre (temperatura 0.2, teto de 400 tokens). Não chama `generate_itinerary_stream`: aquele método força o JSON do roteiro e, na OpenAI, só emite o payload no fim.

O laço SSE mora em `token_sse_stream` (`core/sse.py`). O roteiro continua logando o JSON. O suporte loga só `uid` e a quantidade de caracteres — o texto da pessoa não entra no log.

Cada turno do usuário vai escapado dentro de `<mensagem>`, separado do system.

## Recusa

Pergunta fora da base (receita, capital, código) deve voltar exatamente:

> Só consigo ajudar com dúvidas sobre o Tripfy. Pergunte sobre roteiros, Match, conta ou privacidade.

Não há classificador por palavra-chave. A trava é o prompt.

> [!warning] Teto da KB
> Acima de ~8 KB o loader recusa o arquivo. Aí o caminho é fatiar por tema, não comprimir a base.

## Fora deste MVP

Persistir conversa, retrieval vetorial, ferramentas ("abre minha viagem"), bot anônimo e `react-native-gifted-chat`.

## Relacionados

- [[Gerenciamento de Perfil RF03]] — FAQ e o CTA na tela de ajuda
- [[Geração de Roteiro RF06]] — contrato SSE reaproveitado
