// Stack do onboarding (formulário de preferências — Seção 3.3).
// Guardado por Stack.Protected: só acessível quando logado e sem preferências.

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="preferences" />
    </Stack>
  );
}
