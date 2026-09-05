---
tags: [ui, ios, design-system, acessibilidade, frontend]
data_criacao: 2026-09-04
status: ativo
---

# Liquid Glass e Vidro Nativo

Como o Tripfy renderiza superfícies de vidro no iOS e no Android, e por que a
decisão não é "usar `expo-blur`" nem "usar `expo-glass-effect`", e sim uma
escada entre os dois.

> [!warning] Vidro não se faz com CSS no React Native
> `bg-white/10` é só uma cor translúcida: não amostra o que está atrás. Não
> existe `backdrop-filter` no motor nativo. Vidro de verdade é
> `UIVisualEffectView`, e só chega no JS por módulo nativo.

## A escada de três degraus

Tudo mora em `frontend/src/components/ui/GlassSurface.tsx`. Quem consome nunca
decide o degrau.

| Degrau | Condição | Renderiza |
|--------|----------|-----------|
| 1 | iOS 26+ com a API disponível | `GlassView` (`expo-glass-effect`) — Liquid Glass real, `UIGlassEffect` |
| 2 | iOS 16.4 até 25 | `BlurView` (`expo-blur`) — `UIBlurEffect`, o material anterior |
| 3 | Android, ou "Reduzir Transparência" ligado | `View` com cor opaca |

### Por que o degrau 2 é obrigatório

`GlassView` **degrada para uma `View` transparente e vazia** abaixo do iOS 26.
Trocar `BlurView` por `GlassView` sem guarda faz a tab bar sumir da tela para
todo mundo que não está no iOS 26.

E esse público existe: o **Expo SDK 57 roda a partir do iOS 16.4** (compilado
com Xcode 26.4+). iOS 15 e anteriores não são cenário — a App Store nem oferece
o app. Mas 16.4 até 18.x é real.

### As três guardas de runtime

```ts
isLiquidGlassAvailable()    // app compilado com o SDK que tem Liquid Glass?
isGlassEffectAPIAvailable() // device expõe a API? (betas do iOS 26 crashavam sem isso)
AccessibilityInfo.isReduceTransparencyEnabled() // usuário desligou transparência
```

A terceira é dinâmica: o usuário pode ligar com o app aberto, então tem
listener (`reduceTransparencyChanged`), não leitura única.

> [!info] Development build precisa de rebuild
> `expo-glass-effect` é módulo nativo. Num dev build gerado antes de ele entrar
> no projeto, `requireNativeModule('ExpoGlassEffect')` lança. O `GlassSurface`
> captura isso e cai no degrau 2 — o app não quebra, só não mostra Liquid Glass
> até o próximo `eas build`. Ver [[Build iOS EAS iPhone]].

## A armadilha que quebrou a UI: className morto

O metro roda com `globalClassNamePolyfill: false` (exigido por
[[NativeWind Setup]]). Nesse modo **só os componentes reexportados por `@/tw`
entendem `className`**. Em qualquer outro a prop é aceita e descartada em
silêncio — sem erro, sem warning, sem estilo.

`BlurView`, `GlassView`, `LinearGradient` e `Animated.View` estão nesse grupo.
Foi assim que:

- o botão do Google perdeu `flex-row` e caiu no default `column` do React
  Native, empilhando o logo em cima do texto (parecia desalinhamento de
  `lineHeight`, não era);
- o painel do onboarding perdeu `px-8` e o texto encostou nas bordas;
- os pontinhos de paginação perderam `h-2` e `bg-white` e ficaram invisíveis.

**Regra:** dentro de `GlassSurface` (ou qualquer componente nativo), layout vai
por `style={{...}}`. Para animar com className, use `AnimatedView` /
`AnimatedText` / `AnimatedPressable` de `@/tw`.

O guard runnable é `frontend/scripts/check-dead-classname.mjs`, plugado no
`npm run lint`. Ele tem autoteste embutido — um detector que nunca dispara
passaria despercebido para sempre.

## Onde o vidro é usado

- **Tab bar** ([[Home e Bottom Tabs]]) — pílula flutuante, `bottom = insets.bottom + 16`,
  margem lateral de 16, raio de pílula. Indicador desliza atrás da aba ativa com
  `withSpring({ damping: 20, stiffness: 200 })`: acompanha o dedo sem quicar.
- **Botão social** ([[Design System Auth]]) — `isInteractive` liga o brilho reativo
  ao toque no iOS 26.
- **Painel do onboarding** — `scheme="dark"` forçado: fica sobre foto, o tema do
  app não vale ali.

## O que ficou de fora, de propósito

- **Seta do onboarding em vidro.** Ela vive *dentro* do painel de vidro. Vidro
  sobre vidro sem `GlassContainer` fica sujo e o botão some. Segue círculo branco
  sólido, que é o contraste que a Apple usa sobre material.
- **`UIDesignRequiresCompatibility`.** A chave de Info.plist que desliga o Liquid
  Glass no app inteiro morre no Xcode 27. É adiamento, não solução.

## Swipe-to-delete

Não existe `UISwipeActionsConfiguration` exposto pro React Native: swipe action é
sempre reimplementado. O Tripfy tem um só, em
`frontend/src/components/ui/SwipeToDelete.tsx` (Pan, não `ReanimatedSwipeable`),
usado em Viagens, lixeira e no banner de convite da Home.

- Solta na metade → botão vermelho compacto de 76px; toque apaga.
- Arrasta ~55% da linha (ou flick) → o card sai e apaga sozinho.
- No limiar: háptico uma vez; a lixeira cola na borda do card e acompanha.

`ReanimatedSwipeable` com `flex:1` na ação pintava uma faixa vermelha do tamanho
do overshoot e o `overshootFriction` impedia o commit. Limiares em
`swipeReleaseIntent.ts`, guardados por `scripts/check-swipe-release.mjs`.

## Links

- [[NativeWind Setup]] — por que `globalClassNamePolyfill` é `false`
- [[Design System Auth]]
- [[Home e Bottom Tabs]]
- [[Build iOS EAS iPhone]]
- [[changelog]]
