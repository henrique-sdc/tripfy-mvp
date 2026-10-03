---
title: House Ads
tags:
  - premium
  - monetizacao
  - ads
  - tcc
data_criacao: 2026-10-03
status: ativo
aliases:
  - Anúncios
  - House Ads
  - Interstitial
---

# House Ads (plano Free)

Anúncio interno, sem AdMob e sem SDK. A banca vê o contrato de um interstitial de rede: tela cheia, contagem, **Pular** só aos 5 segundos. O card nativo é o formato quieto.

Relacionado: [[Tripfy Pro e Paywall]], [[Afiliados RF10]], [[Detalhe da Viagem RF07]], [[Home e Bottom Tabs]].

## Gate

`POST /auth/sync` já devolve `is_premium` derivado (`is_premium_effective`). O app guarda em `authStore.isPremium` via `applySync`.

O anúncio usa esse booleano, não `tier === "free"`. Pro expirado pode vir com `tier: "pro"` e `is_premium: false`.

```
shouldShowHouseAds = !isLoading && !isPremium
canSkipInterstitial = elapsed >= 5000
```

Checkout mock (upgrade / cancelar) passa pelo mesmo `applySync`. O card e o interstitial somem quando a simulação vira Pro.

> [!info] Sem servidor de criativo
> O catálogo mora em `frontend/src/lib/houseAds.ts`. AdMob futuro troca o palco e o `onPress`. O gate e os 5 segundos ficam.

## Onde aparece

| Slot | Quando | Criativo |
| --- | --- | --- |
| Interstitial | Ao sair do detalhe do roteiro | Upsell do Tripfy Pro → paywall |
| Card na lista Viagens | Rodapé, filtro Todos, lista não vazia | Upsell |
| Card no detalhe | Fim da lista, só modo Planejar | Booking se há destino e datas; senão Skyscanner; sem destino, upsell |

Não entra na abertura do app, no streaming da geração, no Modo Viagem (o card) nem no `renderItem` da lista. O Free tem no máximo 2 viagens ativas — intercalar “a cada 3” não apareceria.

O interstitial não empilha. Se o paywall já está aberto, a saída do roteiro não pede outro Modal.

O “vídeo” é poster + barra linear de 5s. Sem áudio e sem `expo-video`. O voltar do Android é consumido até o Pular existir. Só o botão de baixo abre o paywall. O toque que fechou o roteiro é ignorado por 500 ms, senão ele vira clique no anúncio. O Pular só fecha.

Rótulo **Patrocinado** nos dois formatos. O hub de reservas ([[Afiliados RF10]]) continua para todo mundo, inclusive Pro — é ferramenta, não anúncio.

## Arquivos

- `frontend/src/lib/houseAds.ts` — gate e catálogo. Check: `npx tsx src/lib/houseAds.selfcheck.ts`
- `frontend/src/components/ads/HouseAdInterstitial.tsx` — irmão do paywall no `_layout`
- `frontend/src/components/ads/NativeAdBanner.tsx`
- `frontend/src/stores/houseAdStore.ts`
