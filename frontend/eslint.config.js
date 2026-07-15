// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // Reanimated SharedValue usa mutação intencional em `.value`; a regra do
      // React Compiler trata esse padrão oficial como falso positivo.
      "react-hooks/immutability": "off",
      // O app hidrata stores e dados remotos em effects; callbacks assíncronos
      // evitam loops, mas a regra não diferencia esses fluxos no React Native.
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
