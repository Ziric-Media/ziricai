#!/usr/bin/env node
/**
 * SWI-M0 — Intelligence Memory admission + store.
 */
import assert from "node:assert/strict";

const { evaluateMemoryAdmission } = await import(
    "../services/sarah/intelligence/sarahIntelligenceMemoryAdmission.js"
);
const {
    recordIntelligenceObservation,
    getIntelligenceObservation,
    compareWithMemory,
    clearIntelligenceMemoryForTests,
} = await import("../services/sarah/intelligence/sarahIntelligenceMemoryStore.js");

clearIntelligenceMemoryForTests();

const good = evaluateMemoryAdmission({
    headline: "Zimbabwe approves new platinum mining corridor in Mhondoro",
    summary:
        "Cabinet published a framework for cluster mining investment with environmental review requirements and export reporting to the minerals marketing body.",
    publisher: "News24",
    region: "zw",
    interest: "mining",
    storyId: "story_test_1",
});
assert.equal(good.admit, true);
assert.ok(["industry", "economy", "global_events"].includes(good.domain));

const thin = evaluateMemoryAdmission({ headline: "Hi", summary: "short", publisher: "News24" });
assert.equal(thin.admit, false);

const saved = recordIntelligenceObservation({
    headline: "Zimbabwe approves new platinum mining corridor in Mhondoro",
    summary:
        "Cabinet published a framework for cluster mining investment with environmental review requirements and export reporting to the minerals marketing body.",
    publisher: "News24",
    region: "zw",
    storyId: "story_test_1",
});
assert.equal(saved.stored, true);
const obs = getIntelligenceObservation(saved.observation.subjectKey);
assert.equal(obs.version, 1);

const updated = recordIntelligenceObservation({
    headline: "Zimbabwe approves new platinum mining corridor in Mhondoro — updated",
    summary:
        "Cabinet published a framework for cluster mining investment with environmental review requirements and export reporting to the minerals marketing body. Parliament review scheduled.",
    publisher: "News24",
    region: "zw",
    storyId: "story_test_1",
});
assert.equal(updated.stored, true);
assert.equal(updated.observation.version, 2);

const cmp = compareWithMemory(saved.observation.subjectKey, {
    headline: "Different breaking headline for same story cluster",
});
assert.equal(cmp.hasHistory, true);
assert.equal(cmp.unchanged, false);
assert.ok(cmp.priorVersion >= 2);

console.log("swi-memory-admission.test.mjs: ok");