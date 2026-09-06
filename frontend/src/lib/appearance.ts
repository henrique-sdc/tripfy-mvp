// Força light/dark no RN (e no light-dark() do NativeWind).
// RN 0.86: setColorScheme('unspecified') = voltar ao sistema. null crasha
// o native (NPE) e deixa useColorScheme() em null → Colors[null].background.

import { Appearance, type ColorSchemeName } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

export function sanitizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function appearanceForMode(mode: ThemeMode): ColorSchemeName {
  return mode === "system" ? "unspecified" : mode;
}

/** Paleta só tem light|dark; o hook do RN ainda pode devolver null. */
export function resolvedColorScheme(
  scheme: string | null | undefined,
): "light" | "dark" {
  return scheme === "dark" ? "dark" : "light";
}

export function applyThemeMode(mode: ThemeMode): void {
  try {
    Appearance.setColorScheme(appearanceForMode(mode));
  } catch (err) {
    console.warn("[prefs] Appearance.setColorScheme falhou:", err);
  }
}
