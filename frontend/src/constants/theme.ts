/**
 * Espelho dos tokens semânticos de `global.css` para props nativas que não
 * aceitam className (placeholderTextColor, ActivityIndicator, ícones, etc.).
 * Qualquer mudança de paleta deve ser replicada nos dois lugares.
 */
import "@/global.css";

import { Platform } from "react-native";

const light = {
  background: "#f7f8fa",
  surface: "#ffffff",
  border: "#e5e5ea",
  textPrimary: "#111111",
  textSecondary: "#8e8e93",
  textMuted: "#c7c7cc",
  buttonPrimary: "#111111",
  buttonText: "#ffffff",
  accent: "#7c3aed",
  surfaceGlass: "rgba(255, 255, 255, 0.7)",
  borderGlass: "rgba(0, 0, 0, 0.05)",
  error: "#ef4444",
  // Aliases legados — telas antigas ainda referenciam estes nomes.
  text: "#111111",
  backgroundElement: "#ffffff",
  backgroundSelected: "#e5e5ea",
} as const;

const dark = {
  background: "#000000",
  surface: "#1c1c1e",
  border: "#333336",
  textPrimary: "#ffffff",
  textSecondary: "#a1a1aa",
  textMuted: "#636366",
  buttonPrimary: "#ffffff",
  buttonText: "#111111",
  accent: "#9d4edd",
  surfaceGlass: "rgba(28, 28, 30, 0.7)",
  borderGlass: "rgba(255, 255, 255, 0.1)",
  error: "#ef4444",
  text: "#ffffff",
  backgroundElement: "#1c1c1e",
  backgroundSelected: "#333336",
} as const;

export const Colors = { light, dark } as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Altura aproximada da FloatingTabBar (miolo + margem). Safe area soma na tela.
export const BottomTabInset = Platform.select({ ios: 56, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
