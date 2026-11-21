#!/usr/bin/env node
import assert from "node:assert/strict";

const {
    shouldPrefetchWorldIntelligence,
    deriveWorldIntelQuery,
} = await import("../services/sarah/personal/personalSarahWorldIntelPrefetch.js");

assert.equal(
    shouldPrefetchWorldIntelligence("What trend is building in Zimbabwe mining, how does it compare to today's headlines"),
    true
);
const q = deriveWorldIntelQuery("What trend is building in Zimbabwe mining?");
assert.ok(q.toLowerCase().includes("zimbabwe"));
assert.ok(q.toLowerCase().includes("mining"));

console.log("personal-sarah-world-intel-prefetch.test.mjs: ok");