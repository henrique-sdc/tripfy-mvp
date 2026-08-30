// Expo usa este arquivo no lugar do app.json estático.
// A chave do Maps vem do .env (não commitada) — app.json fica limpo.

const appJson = require("./app.json");

/** Lê a key sem logar o valor (só o comprimento, pra debug). */
function resolveMapsApiKey() {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  );
}

module.exports = () => {
  const mapsKey = resolveMapsApiKey();
  const expo = JSON.parse(JSON.stringify(appJson.expo));

  expo.android = {
    ...expo.android,
    config: {
      ...(expo.android?.config ?? {}),
      ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
    },
  };

  expo.ios = {
    ...expo.ios,
    config: {
      ...(expo.ios?.config ?? {}),
      ...(mapsKey ? { googleMapsApiKey: mapsKey } : {}),
    },
  };

  // Edge-to-edge + cutout: só entram no binário nativo (expo run:android / EAS).
  // Expo Go ignora esses plugins — por isso o Pixel/Moto ainda cortam no Go.
  const plugins = Array.isArray(expo.plugins) ? [...expo.plugins] : [];
  const hasEdge = plugins.some(
    (p) =>
      p === "react-native-edge-to-edge" ||
      (Array.isArray(p) && p[0] === "react-native-edge-to-edge"),
  );
  if (!hasEdge) {
    plugins.push([
      "react-native-edge-to-edge",
      {
        android: {
          parentTheme: "Default",
          enforceNavigationBarContrast: false,
        },
      },
    ]);
  }
  const hasCutout = plugins.some(
    (p) =>
      p === "./plugins/withAndroidDisplayCutout" ||
      (Array.isArray(p) && p[0] === "./plugins/withAndroidDisplayCutout"),
  );
  if (!hasCutout) {
    plugins.push("./plugins/withAndroidDisplayCutout");
  }
  expo.plugins = plugins;

  if (mapsKey) {
    console.log(
      `[app.config] Google Maps key injetada do .env (len=${mapsKey.length}).`,
    );
  } else {
    console.warn(
      "[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ausente no .env — mapa Android fica bege em builds nativos.",
    );
  }

  // Sem o wrapper `{ expo }`: o eas-cli compara ios/extra na raiz.
  // Com wrapper, `ios.infoPlist` é undefined e o build explode (projectId, ITSApp…).
  return expo;
};
