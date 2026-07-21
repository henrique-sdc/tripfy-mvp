// Força o window a desenhar na área da câmera/notch (API 28+).
// Necessário além do edge-to-edge em alguns OEMs (Motorola) e emuladores Pixel.

const {
  withAndroidStyles,
  AndroidConfig,
} = require("expo/config-plugins");

/**
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
function withAndroidDisplayCutout(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(
      config.modResults,
      {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: "android:windowLayoutInDisplayCutoutMode",
        value: "shortEdges",
      },
    );
    return config;
  });
}

module.exports = withAndroidDisplayCutout;
