#!/usr/bin/env node
/**
 * SWI-M2 — graph edges, trends, corroboration policy.
 */
import assert from "node:assert/strict";

const { evaluateTrendCorroboration } = await import(
    "../services/sarah/intelligence/sarahIntelligenceCorroborationPolicy.js"
);
const {
    clearIntelligenceMemoryForTests,
    recordIntelligenceObservation,
} = await import("../services/sarah/intelligence/sarahIntelligenceMemoryStore.js");
const { clearIntelligenceGraphForTests, listIntelligenceGraphEdges } = await import(
    "../services/sarah/intelligence/sarahIntelligenceGraphService.js"
);
const { clearIntelligenceTrendsForTests, listIntelligenceTrends, buildTrendId } = await import(
    "../services/sarah/intelligence/sarahIntelligenceTrendService.js"
);

clearIntelligenceMemoryForTests();
clearIntelligenceGraphForTests();
clearIntelligenceTrendsForTests();

const prevGraph = process.env.SARAH_INTELLIGENCE_GRAPH_ENABLED;
const prevMem = process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED;
process.env.SARAH_INTELLIGENCE_GRAPH_ENABLED = "true";
process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED = "true";

const baseStory = {
    headline: "Zimbabwe cabinet approves platinum mining corridor framework",
    summary:
        "Cabinet published environmental and export rules for a cluster mining corridor with parliamentary review scheduled and minerals marketing oversight for platinum producers.",
    region: "zw",
    interest: "mining",
    storyId: "swi_m2_story_a",
};

await recordIntelligenceObservation({ ...baseStory, publisher: "News24" });
await recordIntelligenceObservation({
    ...baseStory,
    publisher: "Fin24",
    storyId: "swi_m2_story_b",
    headline: "Zimbabwe mining corridor draws second policy review from cabinet",
});

const trends = await listIntelligenceTrends({ query: "mining", region: "zw" });
assert.ok(trends.length >= 1);
const trend = trends[0];
assert.equal(trend.region, "zw");
assert.ok(trend.publisherCount >= 2);

const corr = evaluateTrendCorroboration({ publishers: ["News24", "Fin24"] });
assert.equal(corr.corroborated, true);

const edges = await listIntelligenceGraphEdges({ edgeType: "related_development", limit: 20 });
assert.ok(edges.length >= 1);

const tid = buildTrendId({ entityId: "topic_mining", kind: "topic", label: "Mining" }, "zw");
assert.equal(tid, "trend_topic_mining_zw");

process.env.SARAH_INTELLIGENCE_GRAPH_ENABLED = prevGraph;
process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED = prevMem;

console.log("swi-graph-trends.test.mjs: ok");