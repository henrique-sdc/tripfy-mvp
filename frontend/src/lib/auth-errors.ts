// Mapeia códigos de erro do Firebase Auth para chaves de i18n.
// Erros são exibidos inline nas telas (nunca via Alert — Decisão 5).

// Cada code do Firebase (ex.: "auth/invalid-credential") vira uma chave de
// tradução em auth.errors.*. Códigos desconhecidos caem em "unknown".
const FIREBASE_ERROR_MAP: Record<string, string> = {
  "auth/invalid-email": "auth.errors.invalidEmail",
  "auth/missing-password": "auth.errors.missingFields",
  "auth/email-already-in-use": "auth.errors.emailInUse",
  "auth/weak-password": "auth.errors.weakPassword",
  "auth/invalid-credential": "auth.errors.invalidCredential",
  "auth/wrong-password": "auth.errors.invalidCredential",
  "auth/user-not-found": "auth.errors.invalidCredential",
  "auth/user-disabled": "auth.errors.userDisabled",
  "auth/too-many-requests": "auth.errors.tooManyRequests",
  "auth/network-request-failed": "auth.errors.networkError",
};

/**
 * Recebe um erro qualquer (do Firebase ou não) e devolve a chave de i18n
 * apropriada para exibir na UI. Sempre retorna uma chave válida.
 */
export function getAuthErrorKey(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && FIREBASE_ERROR_MAP[code]) {
    return FIREBASE_ERROR_MAP[code];
  }
  return "auth.errors.unknown";
}
