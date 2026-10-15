#!/usr/bin/env node
/**
 * AI task execution queue — memory backend (enqueue, dedupe, worker completion).
 */
import assert from "node:assert/strict";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";
process.env.QUEUE_POLL_INTERVAL_MS = "50";

const COMPANY = "ops-ai-queue-co";
const MGR = { role: "manager", uid: "ops-ai-queue-mgr" };
const AGENT_ID = "agent-ops-queue-test";

const { createAiEmployee } = await import("../services/tenants/aiEmployeeService.js");
const { createTask, getTask, createTaskForAccess } = await import("../services/tenants/taskService.js");
const { enqueueAiTaskExecution, aiTaskExecutionExternalId } = await import(
    "../services/operations/aiTaskQueue.js"
);
const { initQueue, shutdownQueue } = await import("../services/queue/jobQueue.js");
const { startAiTaskWorker } = await import("../services/queue/workers/aiTaskWorker.js");

await createAiEmployee(COMPANY, {
    id: AGENT_ID,
    name: "Ops Queue Tester",
    roleLabel: "Operations",
});

startAiTaskWorker();
await initQueue();

const manual = await createTask(COMPANY, {
    title: "Manual enqueue dedupe",
    assigneeType: "ai",
    aiEmployeeId: AGENT_ID,
    executionStatus: "queued",
    executionQueuedAt: new Date().toISOString(),
    status: "open",
});
const ext = aiTaskExecutionExternalId(COMPANY, manual.id);
assert.ok(ext.includes(manual.id));

const jobA = await enqueueAiTaskExecution({ companyId: COMPANY, taskId: manual.id });
const jobB = await enqueueAiTaskExecution({ companyId: COMPANY, taskId: manual.id });
assert.equal(jobA.id, jobB.id, "duplicate enqueue should return the active job");

async function waitForExecution(companyId, taskId, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const t = await getTask(companyId, taskId);
        if (t?.executionStatus === "completed" || t?.executionStatus === "failed") return t;
        await new Promise((r) => setTimeout(r, 80));
    }
    throw new Error(`Timed out waiting for execution on task ${taskId}`);
}

const doneManual = await waitForExecution(COMPANY, manual.id);
assert.equal(doneManual.executionStatus, "completed");
assert.ok(doneManual.executionResult?.includes("Ops Queue Tester"));
assert.ok(Array.isArray(doneManual.activityLog) && doneManual.activityLog.length >= 2);

const viaAccess = await createTaskForAccess(COMPANY, MGR, {
    title: "Create path auto-queue",
    assigneeType: "ai",
    aiEmployeeId: AGENT_ID,
    aiInstructions: "Summarize open tasks",
});
assert.equal(viaAccess.executionStatus, "queued");

const doneAccess = await waitForExecution(COMPANY, viaAccess.id);
assert.equal(doneAccess.executionStatus, "completed");
assert.equal(doneAccess.status, "open", "execution complete must not auto-close task status");

await shutdownQueue();
console.log("AI_TASK_QUEUE_LOCAL_PASS");
