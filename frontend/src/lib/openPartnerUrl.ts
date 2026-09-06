// Abre URL de OTA. Fica fora de affiliates.ts de propósito:
// `import("react-native")` no Metro puxa PushNotificationIOS e crasha no Expo Go.

import { Linking } from "react-native";

import * as Haptics from "@/lib/haptics";

export async function openPartnerUrl(url: string): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn("[affiliates] Falha ao abrir parceiro:", err);
  }
}
