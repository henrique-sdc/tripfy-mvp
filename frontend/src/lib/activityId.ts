/** Id estável da parada. Não usa título nem índice — esses mudam no drag. */
export function newActivityId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
