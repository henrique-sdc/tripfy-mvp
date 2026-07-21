// System bars edge-to-edge — status/nav transparentes + cutout.
// Em Expo Go o tema nativo NÃO muda; o corte da câmera só some de verdade
// com `npx expo run:android` (plugins react-native-edge-to-edge + cutout).

import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import {
  Platform,
  StatusBar as RNStatusBar,
  useColorScheme,
} from "react-native";

import { useTheme } from "@/hooks/use-theme";

/** Aplica fundo nativo + barras transparentes; chamar no root layout. */
export function useSystemBars() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background);

    if (Platform.OS !== "android") return;

    // Runtime: desenha sob a status bar (ajuda no Expo Go; cutout exige build nativo).
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor("transparent");
      RNStatusBar.setBarStyle(isDark ? "light-content" : "dark-content");
    } catch (err) {
      console.warn("[system-bars] RN StatusBar falhou:", err);
    }

    try {
      // light = ícones claros (fundo escuro); dark = ícones escuros (fundo claro).
      NavigationBar.setStyle(isDark ? "light" : "dark");
    } catch (err) {
      console.warn("[system-bars] NavigationBar.setStyle falhou:", err);
    }
  }, [theme.background, isDark]);
}

/** StatusBar global (expo) — ícones no tema. */
export function AppStatusBar() {
  const scheme = useColorScheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
