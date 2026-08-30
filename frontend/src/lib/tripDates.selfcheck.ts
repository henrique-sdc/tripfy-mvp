// ponytail: smoke check — `npx tsx src/lib/tripDates.selfcheck.ts`
import {
  MAX_TRIP_DAYS,
  addLocalDays,
  clampEndToMaxSpan,
  inclusiveDayCount,
  toIsoDate,
} from "./tripDates";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const start = new Date(2026, 6, 1); // 1 jul
const end = new Date(2026, 6, 15);
assert(inclusiveDayCount(start, end) === 15, "inclusive 15");
assert(toIsoDate(start) === "2026-07-01", "iso start");
assert(
  clampEndToMaxSpan(start, addLocalDays(start, 20)).getTime() ===
    addLocalDays(start, MAX_TRIP_DAYS - 1).getTime(),
  "clamp max 15",
);

console.log("tripDates.selfcheck OK");
