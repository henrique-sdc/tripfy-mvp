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

  if (mapsKey) {
    console.log(
      `[app.config] Google Maps key injetada do .env (len=${mapsKey.length}).`,
    );
  } else {
    console.warn(
      "[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ausente no .env — mapa Android fica bege em builds nativos.",
    );
  }

  return { expo };
};
