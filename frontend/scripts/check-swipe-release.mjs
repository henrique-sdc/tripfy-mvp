// Confirma os limiares do swipe-to-delete.
// Rode: node --experimental-strip-types scripts/check-swipe-release.mjs
import assert from "node:assert/strict";

import {
  ACTION_WIDTH,
  swipeReleaseIntent,
} from "../src/components/ui/swipeReleaseIntent.ts";

const row = 360;

assert.equal(swipeReleaseIntent(0, 0, row), "close");
assert.equal(swipeReleaseIntent(-20, 0, row), "close");
assert.equal(swipeReleaseIntent(-ACTION_WIDTH / 2, 0, row), "open");
assert.equal(swipeReleaseIntent(-ACTION_WIDTH, 0, row), "open");
assert.equal(swipeReleaseIntent(-20, -600, row), "open");
assert.equal(swipeReleaseIntent(-row * 0.55, 0, row), "delete");
assert.equal(swipeReleaseIntent(-10, -1300, row), "delete");

console.log("OK: swipeReleaseIntent");
