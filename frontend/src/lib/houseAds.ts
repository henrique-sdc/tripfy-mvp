// House ads do plano Free. O tier efetivo já vem do /auth/sync (`isPremium`).
// Aqui só fica a regra de exibir e o catálogo estático — sem SDK e sem rede.
// ponytail: o “vídeo” do interstitial é um palco com contagem; mp4/AdMob
// substituem o criativo, não este gate.

export const INTERSTITIAL_SKIP_AFTER_MS = 5000;
// O toque que fecha o roteiro cai no Modal que acabou de abrir.
// Nesse intervalo o clique não abre o paywall.
export const HOUSE_AD_CLICK_DELAY_MS = 500;

let houseAdClicksArmedAt = 0;

export function noteHouseAdRequested(now = Date.now()): void {
  houseAdClicksArmedAt = now + HOUSE_AD_CLICK_DELAY_MS;
}

/** `armedAt` 0 = nenhum interstitial pendente, o card da lista pode abrir. */
export function canOpenHouseAd(now: number, armedAt: number): boolean {
  if (armedAt === 0) return true;
  return now >= armedAt;
}

export function canOpenHouseAdNow(now = Date.now()): boolean {
  return canOpenHouseAd(now, houseAdClicksArmedAt);
}

export type HouseAdKind = "upsell" | "affiliate";
export type HouseAdPartner = "booking" | "skyscanner";

export type HouseAdCreative = {
  id: "upsell" | "booking" | "skyscanner";
  kind: HouseAdKind;
  partner: HouseAdPartner | null;
  titleKey: string;
  bodyKey: string;
  ctaKey: string;
  mark: string;
};

const UPSELL: HouseAdCreative = {
  id: "upsell",
  kind: "upsell",
  partner: null,
  titleKey: "ads.upsell.title",
  bodyKey: "ads.upsell.body",
  ctaKey: "ads.upsell.cta",
  mark: "P",
};

const BOOKING: HouseAdCreative = {
  id: "booking",
  kind: "affiliate",
  partner: "booking",
  titleKey: "ads.booking.title",
  bodyKey: "ads.booking.body",
  ctaKey: "ads.booking.cta",
  mark: "B",
};

const SKYSCANNER: HouseAdCreative = {
  id: "skyscanner",
  kind: "affiliate",
  partner: "skyscanner",
  titleKey: "ads.skyscanner.title",
  bodyKey: "ads.skyscanner.body",
  ctaKey: "ads.skyscanner.cta",
  mark: "S",
};

export type DetailAdInput = {
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
};

/** Free já sincronizado. Pro efetivo (inclusive o simulado) não vê anúncio. */
export function shouldShowHouseAds(
  isPremium: boolean,
  isLoading: boolean,
): boolean {
  return !isLoading && !isPremium;
}

/** Antes dos 5s o Pular não existe. O relógio do componente só pergunta isto. */
export function canSkipInterstitial(elapsedMs: number): boolean {
  return elapsedMs >= INTERSTITIAL_SKIP_AFTER_MS;
}

/** Tela cheia ao sair do roteiro: anúncio da própria casa. */
export function pickInterstitialCreative(): HouseAdCreative {
  return UPSELL;
}

/** Rodapé da lista de viagens. */
export function pickTripsCreative(): HouseAdCreative {
  return UPSELL;
}

/**
 * Fim do roteiro, modo Planejar.
 * Destino + datas → Booking. Destino sem datas → Skyscanner. Sem destino → Pro.
 */
export function pickDetailCreative(input: DetailAdInput): HouseAdCreative {
  const destination = input.destination.trim();
  if (!destination) return UPSELL;
  const start = input.startDate?.trim();
  const end = input.endDate?.trim();
  if (start && end) return BOOKING;
  return SKYSCANNER;
}
