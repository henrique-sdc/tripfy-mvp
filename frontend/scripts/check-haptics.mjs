// Preferência de vibração: off cala o app; required (lixeira) ignora o toggle.
import assert from "node:assert/strict";

import { shouldFireHaptic } from "../src/lib/shouldFireHaptic.ts";

assert.equal(shouldFireHaptic(true), true);
assert.equal(shouldFireHaptic(false), false);
assert.equal(shouldFireHaptic(false, { required: true }), true);
assert.equal(shouldFireHaptic(true, { required: true }), true);

console.log("OK: shouldFireHaptic");
