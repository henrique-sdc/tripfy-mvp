---
title: Modo Offline
tags:
  - premium
  - offline
  - rf07
data_criacao: 2026-09-27
status: ativo
aliases:
  - Exportação Offline
  - Offline Premium
---

# Modo Offline (Premium)

Exportação offline da Seção 1.6 / 7.5 do PRD. O usuário Pro escolhe, viagem a viagem, levar o roteiro sem rede. Geração por IA continua gratuita. Ver [[Tripfy Pro e Paywall]] e [[Detalhe da Viagem RF07]].

## O que entra no pin

Ícone de nuvem no header de `/trip-detail` (ao lado de compartilhar). Free abre o [[Tripfy Pro e Paywall]]. Pro, com rede, grava um pin.

O Firestore deste app é o SDK JS (`getFirestore`). Persistência de disco dele é IndexedDB — não sobrevive no React Native. O pin é a cópia:

- `useOfflineTripsStore` (Zustand + AsyncStorage, chave `tripfy-offline-trips`)
- snapshot do roteiro (`SavedTrip` em JSON: dias, notas, datas, `completed`, `place_id`)
- `PlaceDetails` já resolvido por parada (`photo_url` pública do Google, nota, coords)

Byte de imagem não entra no AsyncStorage. `Image.prefetch(urls, "disk")` do `expo-image` guarda a capa. Uma URL por parada. A galeria do sheet fica de fora.

Lookup de Places só no que não está no cache de sessão nem no pin. No máximo 4 em voo. Falha de uma foto não apaga o pin.

## Sem rede

`useIsOffline` (`expo-network`, um listener no módulo). `UNKNOWN` no boot não trava a tela.

| Peça | Comportamento |
| --- | --- |
| Mapa | `TripOsmMap` desmonta. Banner no mesmo slot: mapa indisponível. Sem tiles. |
| Edição | `writesLocked` — drag, swipe, lápis, auto-save, ops da sala, checkbox “feito”. `readOnly` de visitante continua sendo outra flag. |
| Navegar | O botão de rota segue. Abre o mapa do sistema. |
| Abrir a viagem | Se há pin, semeia o cache de `getPlaceDetails` e mostra o roteiro. Sem pin, estado vazio — não o alerta genérico de falha. |
| Com rede | Firestore/API continuam a fonte. O pin só atualiza depois de um save (foto só da parada nova). |

Logout e exclusão de conta apagam os pins do aparelho.

Com pelo menos um pin, a aba Viagens ganha a pílula **Offline**. Configurações tem a linha **Neste celular**, que abre a lista para excluir as cópias. Excluir não apaga a viagem da conta.

> [!warning] Teto
> A URL da foto do Google expira, e o disco do `expo-image` é LRU. Se os dois acontecem, a capa some e o texto fica. Desligar o pin não chama `Image.clearDiskCache` (isso apagaria a foto do app inteiro).

## Fora do corte

Fila de edição offline, pacote de tiles, `@react-native-firebase` só por persistência, ficha longa do lugar (horário, telefone, galeria, reviews).
