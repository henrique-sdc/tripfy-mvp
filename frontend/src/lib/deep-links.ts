// Deep links do app — sempre path-based (`/match/x`), nunca `tripfy://match/x`.
// Com host (`tripfy://match/x`), o Expo trata "match" como hostname e o path
// vira só `/x`, que pode cair em `profile/[id]` e pedir users/{matchId}/public.

import * as Linking from "expo-linking";

/** URL abrível no Expo Go (exp://…/--/…) ou no build (tripfy:///…). */
export function appDeepLink(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return Linking.createURL(path);
}
