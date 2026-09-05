// Vidro nativo da Apple, com degradação em três níveis.
//
// Liquid Glass (UIGlassEffect) só existe do iOS 26 pra cima. Abaixo disso o
// GlassView do expo-glass-effect renderiza uma View transparente e vazia — a
// superfície simplesmente sumiria da tela. Como o Expo SDK 57 roda a partir do
// iOS 16.4, esse intervalo (16.4 até 18.x) é um cenário real de usuário:
//
//   iOS 26+          → GlassView  (Liquid Glass de verdade)
//   iOS 16.4 a 25    → BlurView   (UIBlurEffect, o material anterior)
//   Android / a11y   → cor opaca  (vidro fake com alpha fica pior que sólido)
//
// Nada de simular vidro com className: `bg-white/10` no React Native é só uma
// cor translúcida, não amostra o que está atrás.

import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassColorScheme,
} from "expo-glass-effect";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  View,
  type ViewProps,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const IS_IOS = Platform.OS === "ios";

// Constante do processo: depende do SDK de compilação e do device, não do render.
// `isGlassEffectAPIAvailable` existe porque betas do iOS 26 anunciam o componente
// sem expor a API, e aí o app crasha (expo/expo#40911).
function detectLiquidGlass(): boolean {
  if (!IS_IOS) return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    // Development build compilado antes do expo-glass-effect entrar no projeto:
    // `requireNativeModule('ExpoGlassEffect')` lança. Cair no BlurView é bem
    // melhor que derrubar o app no boot só porque falta um `eas build`.
    return false;
  }
}

const HAS_LIQUID_GLASS = detectLiquidGlass();

const BLUR_TINT = {
  auto: "systemChromeMaterial",
  light: "systemChromeMaterialLight",
  dark: "systemChromeMaterialDark",
} as const;

/**
 * "Reduzir Transparência" (Ajustes › Acessibilidade › Tela e Tamanho do Texto).
 * O usuário pode ligar com o app aberto, então não dá pra ler só uma vez.
 */
export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

export type GlassSurfaceProps = ViewProps & {
  /** Força o material claro/escuro. Use `dark` sobre foto, onde o tema do app não vale. */
  scheme?: GlassColorScheme;
  /** Brilho reativo ao toque do Liquid Glass. Ignorado abaixo do iOS 26. */
  interactive?: boolean;
};

export function GlassSurface({
  scheme = "auto",
  interactive = false,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const systemScheme = useColorScheme();
  const reduceTransparency = useReduceTransparency();

  if (!reduceTransparency && HAS_LIQUID_GLASS) {
    return (
      <GlassView
        {...rest}
        colorScheme={scheme}
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  if (!reduceTransparency && IS_IOS) {
    return (
      <BlurView {...rest} intensity={80} tint={BLUR_TINT[scheme]} style={style}>
        {children}
      </BlurView>
    );
  }

  // A cor vem antes de `style` de propósito: quem precisa de fundo transparente
  // no fallback (ex.: painel sobre gradiente) sobrescreve pelo style.
  const opaque = scheme === "auto" ? systemScheme : scheme;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: Colors[opaque === "dark" ? "dark" : "light"].surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
