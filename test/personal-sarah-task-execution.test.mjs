import assert from "node:assert/strict";
import {
    buildExecutionArtifact,
    executionModeForTask,
    isSubmitApprovalMessage,
    runPersonalSarahTaskExecution,
    approveTaskArtifactForSubmit,
} from "../services/sarah/personal/personalSarahTaskExecution.js";
import { createPersonalSarahTask, getPersonalSarahTask } from "../services/sarah/personal/personalSarahTaskStore.js";
import { assignPersonalSarahTask, handlePersonalSarahTaskMessage } from "../services/sarah/personal/personalSarahTaskOrchestrator.js";

assert.equal(executionModeForTask({ taskType: "compare_products", categoryId: "shopping" }), "research");
assert.ok(buildExecutionArtifact({ title: "Compare phones", taskType: "compare_products", meta: { item: "phones" } }).body.includes("phones"));
assert.ok(isSubmitApprovalMessage("approve submit please"));

const task = await createPersonalSarahTask(
    "u-st05",
    {
        title: "Compare laptops",
        categoryId: "delegate",
        taskType: "compare_products",
        taskKind: "execution",
        meta: { item: "laptops under R15k" },
    },
    { skipAllowance: true }
);
const assigned = await assignPersonalSarahTask("u-st05", task.id);
assert.equal(assigned.task.lifecycleState, "awaiting_approval");

const run = await handlePersonalSarahTaskMessage("u-st05", task.id, "Yes, go ahead", { uid: "u-st05", consumerProfile: {} });
assert.ok(run.reply.includes("artifact") || run.reply.includes("Review"));
const mid = await getPersonalSarahTask("u-st05", task.id);
assert.equal(mid.lifecycleState, "awaiting_review");
assert.ok(Array.isArray(mid.artifacts) && mid.artifacts.length > 0);

const fin = await handlePersonalSarahTaskMessage("u-st05", task.id, "approve submit", { uid: "u-st05", consumerProfile: {} });
assert.ok(fin.reply.toLowerCase().includes("approved") || fin.reply.includes("not paid"));
const done = await getPersonalSarahTask("u-st05", task.id);
assert.equal(done.artifacts[done.artifacts.length - 1].status, "approved");

console.log("personal-sarah-task-execution.test.mjs OK");