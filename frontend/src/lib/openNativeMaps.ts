// Abre o app de mapas nativo (Apple Maps / Google Maps) via deep link.
// Sem SDK nativo — Expo Go + OSM no detalhe da viagem continuam.

import { Linking, Platform } from "react-native";

export function buildNativeMapsUrl(opts: {
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
}): string {
  const lat = opts.latitude;
  const lng = opts.longitude;
  const hasCoords =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng);
  const q = encodeURIComponent((opts.label ?? "").trim() || "destino");

  if (Platform.OS === "ios") {
    if (hasCoords) {
      return `http://maps.apple.com/?daddr=${lat},${lng}`;
    }
    return `http://maps.apple.com/?q=${q}`;
  }

  if (hasCoords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export async function openNativeMaps(opts: {
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
}): Promise<void> {
  // canOpenURL é flaky no Android com https — openURL já falha se não houver handler.
  await Linking.openURL(buildNativeMapsUrl(opts));
}
