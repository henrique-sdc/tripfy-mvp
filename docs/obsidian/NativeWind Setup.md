# NativeWind v5 + Tailwind v4 — Setup Expo

Configuração do styling no frontend Tripfy (Expo SDK 57).

## Arquivos obrigatórios

| Arquivo | Função |
|---------|--------|
| `frontend/metro.config.js` | Wrap com `withNativewind` |
| `frontend/postcss.config.mjs` | Plugin `@tailwindcss/postcss` |
| `frontend/src/global.css` | Imports Tailwind v4 + tema `@theme` |
| `frontend/src/app/_layout.tsx` | Import do CSS (`import '../global.css'`) |
| `frontend/nativewind-env.d.ts` | Types: `react-native-css/types` |
| `frontend/src/tw/index.ts` | Wrappers para `className` |

## O que NÃO é necessário (v5)

- `babel.config.js` para NativeWind
- `tailwind.config.js` (tema via CSS `@theme` em `global.css`)

## Uso de componentes

```tsx
import { View, Text, Pressable } from "@/tw";
// NUNCA: import { View } from "react-native" com className
```

Para animar mantendo `className`, use `AnimatedView` / `AnimatedText` /
`AnimatedPressable`, também de `@/tw`. `Animated.View` cru não repassa a prop.

> [!warning] className morto
> Com `globalClassNamePolyfill: false`, `className` em componente não
> instrumentado é **aceito e descartado em silêncio** — sem erro, sem warning.
> `BlurView`, `GlassView`, `LinearGradient` e `Animated.View` caem nisso; ali o
> layout vai por `style={{...}}`. Já quebrou a UI inteira no iOS 26: ver
> [[Liquid Glass e Vidro Nativo]].
>
> Guard: `node frontend/scripts/check-dead-classname.mjs` (roda no `npm run lint`).

## Dependências

- `nativewind@preview` (v5)
- `react-native-css`
- `tailwindcss` + `@tailwindcss/postcss` + `postcss` (dev)
- Pin `lightningcss@1.30.1` em `package.json` → `overrides`

## Links

- [[changelog]]
- Regra Cursor: `.cursor/rules/expo-tailwind-setup.mdc`
