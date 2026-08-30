// ponytail: smoke check — rode com `npx tsx src/lib/placeDisplay.selfcheck.ts`
import {
  buildPlacesLookupQuery,
  looksLikeStreetPlaceName,
  resolvePlaceTitle,
} from "./placeDisplay";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(looksLikeStreetPlaceName("Cl. 82 #12 -21"), "bogota street");
assert(!looksLikeStreetPlaceName("Centro Comercial Andino"), "mall name");

assert(
  resolvePlaceTitle({
    placesName: "Cl. 82 #12 -21",
    formattedAddress: "Cl. 82 #12-21, Bogotá",
    fallbackTitle: "Visita ao Centro Comercial Andino",
  }) === "Visita ao Centro Comercial Andino",
  "fallback when Places returns street",
);

assert(
  resolvePlaceTitle({
    placesName: "Centro Comercial Andino",
    formattedAddress: "Cl. 82 #12-21, Bogotá",
    fallbackTitle: "Visita ao Centro Comercial Andino",
  }) === "Centro Comercial Andino",
  "keep real Places name",
);

assert(
  buildPlacesLookupQuery(
    "Visita ao Centro Comercial Andino",
    "Cl. 82 #12 -21",
  ).startsWith("Visita"),
  "title leads query",
);

console.log("placeDisplay.selfcheck OK");
