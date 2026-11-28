import assert from "node:assert/strict";
import {
    generateTaskIntelligence,
    mergeTaskChecklists,
    buildTimelineFromDue,
} from "../services/sarah/personal/personalSarahTaskIntelligence.js";
import { createPersonalSarahTask } from "../services/sarah/personal/personalSarahTaskStore.js";
import { applyTaskIntelligence } from "../services/sarah/personal/personalSarahTaskIntelligence.js";

const dueAt = new Date(Date.now() + 10 * 86400000).toISOString();
const intel = generateTaskIntelligence({
    title: "Interview at Acme",
    categoryId: "preparation",
    taskType: "interview",
    dueAt,
});
assert.ok(intel.checklist.length >= 4);
assert.ok(intel.timeline.some((r) => r.kind === "due"));
assert.ok(intel.suggestions.length >= 1);

const merged = mergeTaskChecklists([{ label: "Research the organisation", done: true }], intel.checklist);
assert.equal(merged.filter((c) => c.done).length, 1);

const tl = buildTimelineFromDue(dueAt, [{ label: "Due", atDue: true }]);
assert.equal(tl[0].kind, "due");

const base = await createPersonalSarahTask(
    "u-st04",
    {
        title: "Prep interview",
        categoryId: "preparation",
        taskType: "interview",
        dueAt,
        checklist: [],
    },
    { skipAllowance: true }
);
const enriched = await applyTaskIntelligence("u-st04", base);
assert.ok(Array.isArray(enriched.suggestions) && enriched.suggestions.length > 0);
assert.ok(Array.isArray(enriched.timeline) && enriched.timeline.length > 0);
assert.ok(enriched.checklist.length > 0);

console.log("personal-sarah-task-intelligence.test.mjs OK");