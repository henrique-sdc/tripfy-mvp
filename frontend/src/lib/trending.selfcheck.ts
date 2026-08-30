// ponytail: smoke check — `npx tsx src/lib/trending.selfcheck.ts`
import {
  TRENDING_ITINERARIES,
  filterTrendingItineraries,
  normalizeSearch,
  trendingWizardHref,
} from "../constants/trending";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(TRENDING_ITINERARIES.length >= 12, "catalog size");
assert(normalizeSearch("São Paulo") === "sao paulo", "normalize accents");

const brasil = filterTrendingItineraries(TRENDING_ITINERARIES, {
  category: "brasil",
  query: "",
  resolveTitle: (i) => i.destination,
});
assert(brasil.every((i) => i.region === "brasil"), "brasil filter");
assert(brasil.length >= 3, "brasil has items");

const paris = filterTrendingItineraries(TRENDING_ITINERARIES, {
  category: "all",
  query: "paris",
  resolveTitle: (i) => i.destination,
});
assert(paris.some((i) => i.id === "trend-paris"), "search paris");

const href = trendingWizardHref(TRENDING_ITINERARIES[0]!);
assert(href.includes("destination="), "wizard href");

console.log("trending.selfcheck OK");
