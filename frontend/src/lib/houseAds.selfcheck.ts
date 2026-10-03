// ponytail: smoke check — rode com `npx tsx src/lib/houseAds.selfcheck.ts`
import {
  canOpenHouseAd,
  canSkipInterstitial,
  pickDetailCreative,
  pickInterstitialCreative,
  pickTripsCreative,
  shouldShowHouseAds,
} from "./houseAds";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(shouldShowHouseAds(false, false), "free carregado mostra");
assert(!shouldShowHouseAds(true, false), "pro não mostra");
assert(!shouldShowHouseAds(false, true), "sync pendente não mostra");
assert(!shouldShowHouseAds(true, true), "pro carregando não mostra");

assert(!canSkipInterstitial(0), "zero não pula");
assert(!canSkipInterstitial(4999), "4999 não pula");
assert(canSkipInterstitial(5000), "5000 pula");
assert(canOpenHouseAd(1000, 0), "sem interstitial o clique vale");
assert(!canOpenHouseAd(1000, 1500), "toque da saída não abre o plano");
assert(canOpenHouseAd(1500, 1500), "depois da espera o clique vale");
assert(canSkipInterstitial(5001), "depois de 5s pula");

assert(pickInterstitialCreative().kind === "upsell", "interstitial é upsell");
assert(pickTripsCreative().id === "upsell", "lista é upsell");

const withDates = pickDetailCreative({
  destination: "Lisboa",
  startDate: "2026-07-10",
  endDate: "2026-07-15",
});
assert(withDates.partner === "booking", "destino com datas é Booking");

const noDates = pickDetailCreative({ destination: "Lisboa" });
assert(noDates.partner === "skyscanner", "destino sem datas é Skyscanner");

const blank = pickDetailCreative({ destination: "  " });
assert(blank.kind === "upsell", "sem destino cai no Pro");

console.info("[ads] houseAds.selfcheck ok");
