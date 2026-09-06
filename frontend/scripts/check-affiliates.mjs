// Self-check RF10 — não roda no Metro (process.argv some no RN).
import { runAffiliateSelfCheck } from "../src/lib/affiliates.ts";

runAffiliateSelfCheck();
console.log("affiliates self-check: OK");
