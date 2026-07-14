// Mapa via Leaflet + CARTO em WebView.
// Por quê WebView: no Expo Go o react-native-maps (Google) fica bege porque a
// Expo removeu a API key compartilhada; expo-maps exige dev build. WebView +
// Leaflet não precisa de key nativa e roda no Expo Go/emulador.
//
// Dois bugs clássicos resolvidos aqui:
//  1. Leaflet inicializado antes do container ter altura -> mapa cinza.
//     Fix: init no window.load + invalidateSize em timer e no resize.
//  2. WebView "branco" sem diagnóstico. Fix: onMessage/onError + loading state.

import { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export type MapPoint = {
  key: string;
  title: string;
  latitude: number;
  longitude: number;
};

type Props = {
  points: MapPoint[];
  accentColor: string;
  height: number;
  dark: boolean;
  emptyLabel: string;
  emptyHint: string;
  emptyBg: string;
  mutedColor: string;
  textColor: string;
};

function buildLeafletHtml(
  points: MapPoint[],
  accent: string,
  dark: boolean,
): string {
  const payload = points.map((p, i) => ({
    n: i + 1,
    title: p.title.replace(/[<>]/g, ""),
    lat: p.latitude,
    lng: p.longitude,
  }));

  // CARTO: tiles gratuitos, sem key, com variante clara/escura e retina ({r}).
  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: ${dark ? "#1a1a1a" : "#e8eef3"}; }
    .num {
      background: ${accent};
      color: #fff;
      border-radius: 999px;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      font: 700 12px/1 system-ui, sans-serif;
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    function log(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(String(msg));
      }
    }
    function initMap() {
      try {
        if (typeof L === 'undefined') { log('ERR: Leaflet nao carregou'); return; }
        var pts = ${JSON.stringify(payload)};
        var map = L.map('map', { zoomControl: false, attributionControl: false });
        L.tileLayer('${tileUrl}', {
          maxZoom: 19,
          subdomains: 'abcd',
          detectRetina: true
        }).addTo(map);

        var latlngs = [];
        pts.forEach(function (p) {
          var icon = L.divIcon({
            className: '',
            html: '<div class="num">' + p.n + '</div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          L.marker([p.lat, p.lng], { icon: icon })
            .addTo(map)
            .bindPopup(p.n + '. ' + p.title);
          latlngs.push([p.lat, p.lng]);
        });

        if (latlngs.length >= 2) {
          L.polyline(latlngs, { color: ${JSON.stringify(accent)}, weight: 4, opacity: 0.85 }).addTo(map);
        }

        // Enquadra DEPOIS do invalidateSize: se fitBounds roda com altura 0,
        // o Leaflet calcula zoom máximo (um ponto "colado" na tela).
        function frame() {
          map.invalidateSize(true);
          if (latlngs.length >= 2) {
            map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 15 });
          } else if (latlngs.length === 1) {
            map.setView(latlngs[0], 13);
          } else {
            map.setView([0, 0], 2);
          }
        }
        frame();
        setTimeout(frame, 80);
        setTimeout(frame, 350);
        setTimeout(frame, 900);
        window.addEventListener('resize', frame);
        log('READY:' + pts.length);
      } catch (e) {
        log('ERR:' + (e && e.message ? e.message : e));
      }
    }
    if (document.readyState === 'complete') { initMap(); }
    else { window.addEventListener('load', initMap); }
  </script>
</body>
</html>`;
}

export function TripOsmMap({
  points,
  accentColor,
  height,
  dark,
  emptyLabel,
  emptyHint,
  emptyBg,
  mutedColor,
  textColor,
}: Props) {
  const html = useMemo(
    () => buildLeafletHtml(points, accentColor, dark),
    [points, accentColor, dark],
  );

  // Remonta o WebView quando o conjunto de pontos muda (troca de dia),
  // garantindo reload limpo do HTML.
  const webviewKey = useMemo(
    () => `${dark ? "d" : "l"}-${points.map((p) => p.key).join(",")}`,
    [points, dark],
  );

  function handleMessage(e: WebViewMessageEvent) {
    const data = e.nativeEvent.data;
    if (data.startsWith("ERR")) {
      console.warn("[TripOsmMap] WebView:", data);
    } else if (data.startsWith("READY")) {
      // Silencioso em produção; útil pra confirmar render no dev.
      if (__DEV__) console.log("[TripOsmMap] mapa pronto:", data);
    }
  }

  if (points.length === 0) {
    return (
      <View style={[styles.shell, styles.centered, { height, backgroundColor: emptyBg }]}>
        <Text style={[styles.emptyTitle, { color: textColor }]}>
          {emptyLabel}
        </Text>
        <Text style={[styles.emptyHint, { color: mutedColor }]}>
          {emptyHint}
        </Text>
      </View>
    );
  }

  // baseUrl no Android: origem "null" (source html cru) faz o WebView bloquear
  // requests de CDN/tiles em algumas versões. Uma origem https destrava.
  const source =
    Platform.OS === "android"
      ? { html, baseUrl: "https://tripfy.app/" }
      : { html };

  return (
    <View style={[styles.shell, { height, backgroundColor: emptyBg }]}>
      <WebView
        key={webviewKey}
        originWhitelist={["*"]}
        source={source}
        style={styles.webview}
        // Sem gestos verticais roubados da lista abaixo; o Leaflet cuida do pan.
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        // Android: mixed content liberado evita bloqueio de tiles/CDN.
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.centered, StyleSheet.absoluteFill]}>
            <ActivityIndicator color={accentColor} />
          </View>
        )}
        onMessage={handleMessage}
        onError={(e) =>
          console.warn("[TripOsmMap] erro WebView:", e.nativeEvent)
        }
        onHttpError={(e) =>
          console.warn("[TripOsmMap] HTTP:", e.nativeEvent.statusCode)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});
