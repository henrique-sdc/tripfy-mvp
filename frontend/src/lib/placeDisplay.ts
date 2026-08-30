// Heurística: Places às vezes devolve o endereço como "nome" (ex. "Cl. 82 #12 -21").
// Nesses casos preferimos o título da parada no roteiro (ex. "Centro Comercial Andino").

export type PlaceFallback = {
  title: string;
  description?: string;
  location?: string;
  photoUrl?: string | null;
};

const STREET_NAME_RE =
  /^(cl\.|calle|cra\.|cr\.|carrera|av\.|avenida|rua|r\.|tv\.|travessa|n[ºo°]?|km\.?)\b/i;

/** Nome que parece só endereço/rua — ruim pra título de card ou review. */
export function looksLikeStreetPlaceName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (STREET_NAME_RE.test(n) || /^\d/.test(n)) return true;
  // "Cl. 82 #12 -21" / "Calle 82 #12-21"
  if (/^(cl|calle|cra|cr|carrera|av|avenida|rua)\.?\s*\d/i.test(n)) return true;
  return false;
}

export function resolvePlaceTitle(opts: {
  placesName?: string | null;
  formattedAddress?: string | null;
  fallbackTitle?: string | null;
}): string {
  const name = opts.placesName?.trim() || "";
  const addr = opts.formattedAddress?.trim() || "";
  const fallback = opts.fallbackTitle?.trim() || "";

  if (!name) return fallback;

  const nameIsStreet = looksLikeStreetPlaceName(name);
  const nameNorm = name.toLowerCase();
  const addrNorm = addr.toLowerCase();
  const nameIsAddress =
    Boolean(addr) &&
    (nameNorm === addrNorm ||
      addrNorm.startsWith(nameNorm) ||
      nameNorm === addrNorm.split(",")[0]?.trim());

  if (fallback && (nameIsStreet || nameIsAddress)) return fallback;
  if (!fallback && nameIsStreet) return "";
  return name;
}

/** Query Places: título primeiro; endereço só reforça (sozinho casa pin genérico). */
export function buildPlacesLookupQuery(title: string, location: string): string {
  const t = title.trim();
  const loc = location.trim();
  if (t && loc) return `${t}, ${loc}`;
  return t || loc;
}
