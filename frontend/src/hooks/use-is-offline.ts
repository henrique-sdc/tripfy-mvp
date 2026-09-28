// Um listener para o app inteiro. Cada tela só assina o booleano.
// Dev client antigo não traz ExpoNetwork: o import estático derruba o roteiro.
// Sem o módulo, seguimos como online (o pin offline deixa de detectar a rede).

import { requireOptionalNativeModule } from "expo-modules-core";
import { useSyncExternalStore } from "react";

import { deviceIsOffline, type NetSnap } from "@/lib/offlineNetwork";

type NetworkApi = {
  getNetworkStateAsync: () => Promise<NetSnap>;
  addNetworkStateListener: (
    listener: (state: NetSnap) => void,
  ) => { remove: () => void };
};

// requireOptionalNativeModule devolve o nativo cru, sem getNetworkStateAsync.
// A API usada aqui mora no pacote JS — e esse import só é seguro se o nativo existe.
function loadNetwork(): NetworkApi | null {
  try {
    if (!requireOptionalNativeModule("ExpoNetwork")) return null;
    // import estático desse pacote chama requireNativeModule e derruba o binário antigo.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-network") as NetworkApi & { default?: NetworkApi };
    const api = typeof mod.getNetworkStateAsync === "function" ? mod : mod.default;
    if (
      !api ||
      typeof api.getNetworkStateAsync !== "function" ||
      typeof api.addNetworkStateListener !== "function"
    ) {
      return null;
    }
    return api;
  } catch (err) {
    console.warn("[offline] expo-network indisponível:", err);
    return null;
  }
}

const Network = loadNetwork();

let offline = false;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function apply(state: NetSnap) {
  const next = deviceIsOffline(state);
  if (next === offline) return;
  offline = next;
  emit();
}

function ensure() {
  if (started || !Network) return;
  started = true;
  void Network.getNetworkStateAsync()
    .then(apply)
    .catch((err) => {
      console.warn("[offline] leitura de rede falhou:", err);
    });
  Network.addNetworkStateListener(apply);
}

function subscribe(onStoreChange: () => void) {
  ensure();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, () => offline, () => false);
}
