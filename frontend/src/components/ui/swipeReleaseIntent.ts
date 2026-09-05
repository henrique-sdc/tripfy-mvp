// Limiares do swipe-to-delete (Mail / Alarmes). Sem React Native de propósito:
// o check em `scripts/check-swipe-release.mjs` importa este arquivo direto.

export const ACTION_WIDTH = 76;
export const COMMIT_RATIO = 0.55;

export type SwipeReleaseIntent = "close" | "open" | "delete";

export function swipeReleaseIntent(
  translationX: number,
  velocityX: number,
  rowWidth: number,
): SwipeReleaseIntent {
  "worklet";
  const revealed = -translationX;
  if (revealed >= rowWidth * COMMIT_RATIO || velocityX <= -1200) {
    return "delete";
  }
  if (revealed >= ACTION_WIDTH / 2 || velocityX <= -500) return "open";
  return "close";
}
