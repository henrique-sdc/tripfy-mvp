// Hápticos do app. Quase tudo respeita Configurações › Vibração.
// Exceção: swipe-to-delete da lixeira (`required: true`) — feedback do gesto,
// não ruído de navegação.

import * as ExpoHaptics from "expo-haptics";

import { shouldFireHaptic, type HapticOpts } from "@/lib/shouldFireHaptic";
import { usePreferencesStore } from "@/stores/preferencesStore";

export { shouldFireHaptic } from "@/lib/shouldFireHaptic";
export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

function allowed(opts?: HapticOpts): boolean {
  return shouldFireHaptic(usePreferencesStore.getState().haptics, opts);
}

export function impactAsync(
  style: ExpoHaptics.ImpactFeedbackStyle = ImpactFeedbackStyle.Light,
  opts?: HapticOpts,
): Promise<void> {
  if (!allowed(opts)) return Promise.resolve();
  return ExpoHaptics.impactAsync(style);
}

export function notificationAsync(
  type: ExpoHaptics.NotificationFeedbackType,
  opts?: HapticOpts,
): Promise<void> {
  if (!allowed(opts)) return Promise.resolve();
  return ExpoHaptics.notificationAsync(type);
}

export function selectionAsync(opts?: HapticOpts): Promise<void> {
  if (!allowed(opts)) return Promise.resolve();
  return ExpoHaptics.selectionAsync();
}
