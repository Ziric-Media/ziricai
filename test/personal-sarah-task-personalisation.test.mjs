import assert from "node:assert/strict";
import { createPersonalSarahTask } from "../services/sarah/personal/personalSarahTaskStore.js";
import {
    getTaskPersonalisation,
    saveTaskAsTemplate,
    createTaskFromTemplate,
    recordTaskLearning,
} from "../services/sarah/personal/personalSarahTaskPersonalisation.js";

const uid = "u-st06";
const base = await createPersonalSarahTask(
    uid,
    {
        title: "Weekly interview prep",
        categoryId: "preparation",
        taskType: "interview",
        checklist: [{ label: "Research", done: true }],
    },
    { skipAllowance: true }
);
const tpl = await saveTaskAsTemplate(uid, base, { name: "My interview" });
assert.ok(tpl.id);

const again = await createTaskFromTemplate(uid, tpl.id);
assert.equal(again.taskType, "interview");
assert.ok(again.meta?.fromTemplateId);

await recordTaskLearning(uid, { ...base, status: "completed", taskType: "interview" });
await recordTaskLearning(uid, { ...base, status: "completed", taskType: "interview" });

const prefs = await getTaskPersonalisation(uid);
assert.equal(prefs.learning.counts.interview, 2);
assert.ok((prefs.routines || []).some((r) => r.taskType === "interview"));

console.log("personal-sarah-task-personalisation.test.mjs OK");