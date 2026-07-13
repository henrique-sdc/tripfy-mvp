// Stack do fluxo de autenticação (login e cadastro).
// Guardado por Stack.Protected no layout raiz: só é acessível quando deslogado.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
