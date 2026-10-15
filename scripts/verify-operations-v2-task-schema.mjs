#!/usr/bin/env node
/**
 * Operations v2 — AI assignment + due date normalization (memory).
 */
import assert from "node:assert/strict";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";

const COMPANY = "ops-v2-schema-co";
const MGR = { role: "manager", uid: "ops-v2-mgr" };

const { createTaskForAccess, getTaskForAccess } = await import("../services/tenants/taskService.js");
const { normalizeTaskDueAt } = await import("../services/auth/taskDueAt.js");
const { createAiEmployee } = await import("../services/tenants/aiEmployeeService.js");
const { startAiTaskWorker } = await import("../services/queue/workers/aiTaskWorker.js");

startAiTaskWorker();
await createAiEmployee(COMPANY, { id: "agent-hr-1", name: "HR Agent", roleLabel: "HR" });

assert.throws(() => normalizeTaskDueAt("Friday"), /Invalid due date/);
const iso = normalizeTaskDueAt("2026-12-01T10:00:00.000Z");
assert.ok(iso.includes("2026-12-01"));

const human = await createTaskForAccess(COMPANY, MGR, {
    title: "Human task",
    description: "Details",
    assigneeType: "human",
    assigneeUid: "ops-v2-mgr",
    dueAt: "2026-12-15",
    status: "open",
});
assert.equal(human.assigneeType, "human");
assert.equal(human.status, "open");

const ai = await createTaskForAccess(COMPANY, MGR, {
    title: "AI task",
    description: "Do reporting",
    assigneeType: "ai",
    aiEmployeeId: "agent-hr-1",
    aiInstructions: "Send summary",
});
assert.equal(ai.assigneeType, "ai");
assert.equal(ai.aiEmployeeId, "agent-hr-1");
assert.equal(ai.executionStatus, "queued");
assert.ok(ai.executionQueuedAt);
assert.equal(ai.assigneeUid, null);

const loaded = await getTaskForAccess(COMPANY, ai.id, MGR);
assert.ok(
    ["queued", "in_progress", "completed"].includes(loaded.executionStatus),
    `executionStatus=${loaded.executionStatus}`
);
assert.ok(loaded.executionQueuedAt);

console.log("OPERATIONS_V2_TASK_SCHEMA_PASS");
