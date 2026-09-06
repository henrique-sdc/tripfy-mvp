// Configuração do i18next (Seção 2.6 — i18n desde o início).
// O MVP é 100% pt-BR, mas toda string de UI passa por chaves de tradução
// para que adicionar inglês/espanhol depois não exija refatoração.

import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ptBR from "@/locales/pt-BR.json";

export const SUPPORTED_LOCALES = ["pt-BR"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const deviceLanguage = getLocales()[0]?.languageCode ?? "pt";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
  },
  lng: deviceLanguage.startsWith("pt") ? "pt-BR" : "pt-BR",
  fallbackLng: "pt-BR",
  interpolation: { escapeValue: false },
});

export function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function applyLocale(locale: string): void {
  const lng: AppLocale = isAppLocale(locale) ? locale : "pt-BR";
  if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
}

export default i18n;
