import "@/lib/i18n";
import "../global.css";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { useAuth } from "@/hooks/useAuth";
import { selectIsAuthenticated, useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";

// Mantém a splash nativa visível até resolvermos o estado inicial de auth.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Liga Firebase ↔ Zustand ↔ Backend (restaura sessão persistida na subida).
  useAuth();

  const isLoading = useAuthStore((s) => s.isLoading);
  const hasPreferences = useAuthStore((s) => s.hasPreferences);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const hasSeenSlides = useOnboardingStore((s) => s.hasSeenSlides);
  const hasSlidesHydrated = useOnboardingStore((s) => s.hasHydrated);

  // Enquanto checamos a sessão (Firebase) e reidratamos o carrossel de
  // apresentação (AsyncStorage), não renderizamos nada — a splash nativa
  // segue na tela (só é escondida pelo AnimatedSplashOverlay depois disso).
  if (isLoading || !hasSlidesHydrated) {
    return null;
  }

  return (
    /* O GestureHandlerRootView envelopa o app todo com flex: 1 */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <OfflineBanner />
        {/* Navegação declarativa: cada grupo é liberado por uma condição (guard).
            O Expo Router redireciona sozinho para o primeiro grupo acessível.
            Ordem: slides de apresentação (1x por instalação) → auth → onboarding
            de preferências → tabs. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!hasSeenSlides}>
            <Stack.Screen name="(onboarding-slides)" />
          </Stack.Protected>

          <Stack.Protected guard={hasSeenSlides && !isAuthenticated}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>

          <Stack.Protected
            guard={hasSeenSlides && isAuthenticated && hasPreferences === false}
          >
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>

          <Stack.Protected
            guard={hasSeenSlides && isAuthenticated && hasPreferences === true}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="wizard/solo"
              options={{
                presentation: "fullScreenModal",
                animation: "slide_from_bottom",
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="trending"
              options={{
                animation: "slide_from_right",
                headerShown: false,
              }}
            />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
