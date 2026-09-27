// Rede do aparelho, não "a API falhou" (isso continua no banner âmbar).
// UNKNOWN no boot vem com isConnected false — tratar como online, senão
// a edição trava no primeiro frame antes do rádio responder.

export type NetSnap = {
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

export function deviceIsOffline(state: NetSnap | null | undefined): boolean {
  if (!state) return false;
  if (state.isInternetReachable === false) return true;
  if (state.type == null || state.type === "UNKNOWN") return false;
  return state.isConnected === false;
}

function runSelfCheck(): void {
  const cases: [NetSnap | null, boolean][] = [
    [null, false],
    [{ type: "UNKNOWN", isConnected: false }, false],
    [{ type: "NONE", isConnected: false }, true],
    [{ type: "WIFI", isConnected: true, isInternetReachable: false }, true],
    [{ type: "WIFI", isConnected: true, isInternetReachable: true }, false],
    [{ isConnected: false }, false],
  ];
  for (const [state, expected] of cases) {
    const got = deviceIsOffline(state);
    if (got !== expected) {
      throw new Error(
        `deviceIsOffline(${JSON.stringify(state)}) = ${String(got)}, esperado ${String(expected)}`,
      );
    }
  }
}

// Hermes tem `process` sem `argv`. Indexar `argv` undefined derruba o bundle.
const argv =
  typeof process !== "undefined" && Array.isArray(process.argv)
    ? process.argv
    : undefined;
const entry = argv?.[1]?.replace(/\\/g, "/");
if (entry?.endsWith("src/lib/offlineNetwork.ts")) {
  runSelfCheck();
  console.log("offlineNetwork ok");
}
