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

const saved = await recordIntelligenceObservation({
    headline: "Zimbabwe approves new platinum mining corridor in Mhondoro",
    summary:
        "Cabinet published a framework for cluster mining investment with environmental review requirements and export reporting to the minerals marketing body.",
    publisher: "News24",
    region: "zw",
    storyId: "story_test_1",
});
assert.equal(saved.stored, true);
const obs = await getIntelligenceObservation(saved.observation.subjectKey);
assert.equal(obs.version, 1);

const updated = await recordIntelligenceObservation({
    headline: "Zimbabwe approves new platinum mining corridor in Mhondoro — updated",
    summary:
        "Cabinet published a framework for cluster mining investment with environmental review requirements and export reporting to the minerals marketing body. Parliament review scheduled.",
    publisher: "News24",
    region: "zw",
    storyId: "story_test_1",
});
assert.equal(updated.stored, true);
assert.equal(updated.observation.version, 2);

const cmp = await compareWithMemory(saved.observation.subjectKey, {
    headline: "Different breaking headline for same story cluster",
});
assert.equal(cmp.hasHistory, true);
assert.equal(cmp.unchanged, false);
assert.ok(cmp.priorVersion >= 2);

const { recallWorldContext, formatWorldContextForModel } = await import(
    "../services/sarah/intelligence/sarahIntelligenceRecallService.js"
);
const { listIntelligenceObservations } = await import(
    "../services/sarah/intelligence/sarahIntelligenceMemoryStore.js"
);

const prevFlag = process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED;
process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED = "true";
const recalled = await recallWorldContext({ query: "platinum", limit: 5 });
assert.equal(recalled.active, true);
assert.ok(recalled.observations.length >= 1);
const formatted = formatWorldContextForModel(recalled);
assert.ok(formatted.includes("platinum") || formatted.includes("Platinum"));
const listed = await listIntelligenceObservations({ query: "zimbabwe", limit: 5 });
assert.ok(listed.length >= 1);
process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED = prevFlag;

console.log("swi-memory-admission.test.mjs: ok");