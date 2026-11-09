import assert from "node:assert/strict";
import { HANDOVER_STATES } from "../services/users/messagingContracts.js";
import { detectHumanHandoverIntent, ownershipStateFromTakeover } from "../services/users/handoverStateService.js";

assert.ok(detectHumanHandoverIntent("I'd like to speak to a human please"));
assert.equal(ownershipStateFromTakeover(true), HANDOVER_STATES.HUMAN_ACTIVE);
console.log("ch6-handover.test.mjs: ok");
