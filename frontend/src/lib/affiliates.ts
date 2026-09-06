// Smart Deep Links de OTAs (RF10). IDs de afiliado são públicos (nascem na query).
// Sem API de inventário: o app só monta a busca da OTA com destino + datas.
// Sem import de react-native aqui: o self-check Node e o Metro do Expo Go
// não podem carregar o barrel do RN (PushNotificationIOS).

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const BOOKING_AID =
  process.env.EXPO_PUBLIC_BOOKING_AID?.trim() || "TRIPFY_MOCK_AID";
const SKYSCANNER_ASSOCIATE_ID =
  process.env.EXPO_PUBLIC_SKYSCANNER_ASSOCIATE_ID?.trim() || "TRIPFY_MOCK_ID";
const GETYOURGUIDE_PARTNER_ID =
  process.env.EXPO_PUBLIC_GETYOURGUIDE_PARTNER_ID?.trim() || "TRIPFY_MOCK_PID";
const TRAVELPAYOUTS_MARKER =
  process.env.EXPO_PUBLIC_TRAVELPAYOUTS_MARKER?.trim() || "";

export type TripDateRange = {
  destination: string;
  checkIn?: string;
  checkOut?: string;
};

export type FlightDateRange = {
  destination: string;
  outboundDate?: string;
  inboundDate?: string;
};

/** ISO válido ou undefined — nunca inventa check-in. */
function validIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = value.trim().slice(0, 10);
  return ISO_DATE.test(iso) ? iso : undefined;
}

const SKYSCANNER_ORIGIN =
  process.env.EXPO_PUBLIC_SKYSCANNER_ORIGIN?.trim().toLowerCase() || "saoa";

// Entity IDs do path Skyscanner (não aceita "voos-para-lisboa").
// País = ISO-2; cidade = metro 3–4 letras. Wizard não coleta origem — default
// São Paulo (qualquer) = `saoa`, o mesmo do form BR.
const SKYSCANNER_PLACES: Record<string, string> = {
  mocambique: "mz",
  mozambique: "mz",
  portugal: "pt",
  espanha: "es",
  spain: "es",
  franca: "fr",
  france: "fr",
  italia: "it",
  italy: "it",
  alemanha: "de",
  germany: "de",
  "reino unido": "uk",
  inglaterra: "uk",
  "estados unidos": "us",
  eua: "us",
  usa: "us",
  brasil: "br",
  brazil: "br",
  argentina: "ar",
  chile: "cl",
  japao: "jp",
  japan: "jp",
  lisboa: "lis",
  lisbon: "lis",
  porto: "opo",
  paris: "pari",
  londres: "lond",
  london: "lond",
  madrid: "mad",
  barcelona: "bcn",
  roma: "rome",
  rome: "rome",
  "nova york": "nyca",
  "new york": "nyca",
  "rio de janeiro": "rioa",
  rio: "rioa",
  "sao paulo": "saoa",
  toquio: "tyoa",
  tokyo: "tyoa",
};

function foldPlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 2026-09-05 → 260905 (Skyscanner usa YYMMDD, não YYYYMMDD). */
function skyscannerDate(iso: string): string {
  return `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
}

function skyscannerPlaceId(destination: string): string {
  const folded = foldPlace(destination);
  const commaParts = destination
    .split(",")
    .map((part) => foldPlace(part))
    .filter(Boolean);
  const candidates = [folded, ...commaParts].filter(Boolean);

  for (const key of candidates) {
    const hit = SKYSCANNER_PLACES[key];
    if (hit) return hit;
  }

  const word = (commaParts[0] || folded).split(" ")[0];
  if (word.length >= 3) return word.slice(0, 3);
  return word || "anywhere";
}

export function buildBookingHotelsUrl({
  destination,
  checkIn,
  checkOut,
}: TripDateRange): string {
  const city = destination.trim();
  const inIso = validIso(checkIn);
  const outIso = validIso(checkOut);

  if (TRAVELPAYOUTS_MARKER) {
    const qs = new URLSearchParams({
      location: city,
      marker: TRAVELPAYOUTS_MARKER,
      currency: "brl",
      language: "pt",
    });
    if (inIso) qs.set("checkIn", inIso);
    if (outIso) qs.set("checkOut", outIso);
    return `https://search.hotellook.com/?${qs.toString()}`;
  }

  const qs = new URLSearchParams({
    ss: city,
    group_adults: "2",
    no_rooms: "1",
    aid: BOOKING_AID,
    label: "tripfy-tcc",
  });
  if (inIso) qs.set("checkin", inIso);
  if (outIso) qs.set("checkout", outIso);
  return `https://www.booking.com/searchresults.html?${qs.toString()}`;
}

export function buildSkyscannerFlightsUrl({
  destination,
  outboundDate,
  inboundDate,
}: FlightDateRange): string {
  const dest = skyscannerPlaceId(destination);
  const out = validIso(outboundDate);
  const inn = validIso(inboundDate);
  const chunks = [SKYSCANNER_ORIGIN, dest];
  if (out) chunks.push(skyscannerDate(out));
  if (out && inn) chunks.push(skyscannerDate(inn));

  const qs = new URLSearchParams({
    adultsv2: "1",
    cabinclass: "economy",
    rtn: out && inn ? "1" : "0",
    associateid: SKYSCANNER_ASSOCIATE_ID,
  });
  return `https://www.skyscanner.com.br/transporte/passagens-aereas/${chunks.join("/")}/?${qs.toString()}`;
}

export function buildGetYourGuideUrl(query: string): string {
  const qs = new URLSearchParams({
    q: query.trim(),
    partner_id: GETYOURGUIDE_PARTNER_ID,
  });
  return `https://www.getyourguide.com.br/s/?${qs.toString()}`;
}

export function runAffiliateSelfCheck(): void {
  const hotels = buildBookingHotelsUrl({
    destination: "São Paulo",
    checkIn: "2026-07-10",
    checkOut: "2026-07-15",
  });
  const encoded = encodeURIComponent("São Paulo");
  const encodedForm = encoded.replaceAll("%20", "+");
  if (!hotels.includes(encoded) && !hotels.includes(encodedForm)) {
    throw new Error(`encoding falhou: ${hotels}`);
  }
  if (!hotels.includes("aid=") && !hotels.includes("marker=")) {
    throw new Error(`afiliado ausente: ${hotels}`);
  }
  if (!hotels.includes("2026-07-10") || !hotels.includes("2026-07-15")) {
    throw new Error(`datas ausentes: ${hotels}`);
  }

  const noDates = buildBookingHotelsUrl({ destination: "Lisboa" });
  if (noDates.includes("checkin=") || noDates.includes("checkIn=")) {
    throw new Error(`data inventada: ${noDates}`);
  }
  const invalid = buildBookingHotelsUrl({
    destination: "Lisboa",
    checkIn: "10/07/2026",
    checkOut: "not-a-date",
  });
  if (invalid.includes("10/07/2026") || invalid.includes("not-a-date")) {
    throw new Error(`data inválida vazou: ${invalid}`);
  }

  const flights = buildSkyscannerFlightsUrl({
    destination: "Lisboa",
    outboundDate: "2026-07-10",
    inboundDate: "2026-07-15",
  });
  if (!flights.includes("/saoa/lis/260710/260715/")) {
    throw new Error(`path Skyscanner: ${flights}`);
  }
  if (flights.includes("20260710") || flights.includes("voos-para-")) {
    throw new Error(`formato velho vazou: ${flights}`);
  }
  if (!flights.includes("adultsv2=1") || !flights.includes("rtn=1")) {
    throw new Error(`query Skyscanner: ${flights}`);
  }
  if (!flights.includes("associateid=")) {
    throw new Error(`associateid ausente: ${flights}`);
  }

  const mz = buildSkyscannerFlightsUrl({
    destination: "Moçambique",
    outboundDate: "2026-09-05",
    inboundDate: "2026-09-06",
  });
  if (!mz.includes("/saoa/mz/260905/260906/")) {
    throw new Error(`país Skyscanner: ${mz}`);
  }

  const places = buildSkyscannerFlightsUrl({
    destination: "Lisboa, Portugal",
    outboundDate: "2026-07-10",
    inboundDate: "2026-07-15",
  });
  if (!places.includes("/saoa/lis/")) {
    throw new Error(`Places city-first: ${places}`);
  }

  const gyg = buildGetYourGuideUrl("Mosteiro dos Jerónimos Lisboa");
  const gygEncoded = encodeURIComponent("Mosteiro dos Jerónimos Lisboa");
  const gygForm = gygEncoded.replaceAll("%20", "+");
  if (!gyg.includes(gygEncoded) && !gyg.includes(gygForm)) {
    throw new Error(`GYG encoding: ${gyg}`);
  }
  if (!gyg.includes("partner_id=")) {
    throw new Error(`GYG partner: ${gyg}`);
  }
}
