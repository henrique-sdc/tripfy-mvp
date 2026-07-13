// Configuração do i18next (Seção 2.6 — i18n desde o início).
// O MVP é 100% pt-BR, mas toda string de UI passa por chaves de tradução
// para que adicionar inglês/espanhol depois não exija refatoração.

import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ptBR from "@/locales/pt-BR.json";

// Detecta o idioma do dispositivo; hoje só temos pt-BR, então ele é o fallback.
const deviceLanguage = getLocales()[0]?.languageCode ?? "pt";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
  },
  lng: deviceLanguage.startsWith("pt") ? "pt-BR" : "pt-BR",
  fallbackLng: "pt-BR",
  // React já escapa a saída; o escape do i18next seria redundante.
  interpolation: { escapeValue: false },
});

export default i18n;
