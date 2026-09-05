// Regra pura da vibração — sem store, sem nativo. O wrapper só consulta isso.

export type HapticOpts = { required?: boolean };

export function shouldFireHaptic(enabled: boolean, opts?: HapticOpts): boolean {
  return opts?.required === true || enabled;
}
