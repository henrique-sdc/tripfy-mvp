// ponytail: smoke check — `npx tsx src/lib/vibeDestinations.selfcheck.ts`
import { getRecommendedDestinations } from "./vibeDestinations";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const beach = getRecommendedDestinations({
  interests: ["beaches", "wellness"],
});
assert(beach.length === 5, "default limit 5");
assert(beach[0]?.id === "dest-bali", "beaches → bali first");

const culture = getRecommendedDestinations({
  interests: ["history_architecture", "art_museums"],
});
assert(
  culture[0]?.id === "dest-rome" || culture[0]?.id === "dest-lisbon",
  "culture → rome or lisbon first",
);

const empty = getRecommendedDestinations(null);
assert(empty.length === 5, "null prefs → 5 defaults");
assert(empty[0]?.id === "dest-bali", "defaults keep catalog order");

const four = getRecommendedDestinations({ interests: ["nightlife"] }, 4);
assert(four.length === 4, "custom limit 4");

console.log("vibeDestinations.selfcheck OK");
