// Um listener para o app inteiro. Cada tela só assina o booleano.

import * as Network from "expo-network";
import { useSyncExternalStore } from "react";

import { deviceIsOffline } from "@/lib/offlineNetwork";

let offline = false;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function apply(state: Network.NetworkState) {
  const next = deviceIsOffline(state);
  if (next === offline) return;
  offline = next;
  emit();
}

function ensure() {
  if (started) return;
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
