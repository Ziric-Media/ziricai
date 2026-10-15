#!/usr/bin/env node
/**
 * Operations v2 — AI execution queue suite (memory, isolated).
 * Covers assignment, permissions, tenant scope, dedupe, idempotent worker, failure, activity, human path.
 */
import assert from "node:assert/strict";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";
process.env.QUEUE_POLL_INTERVAL_MS = "50";

const CO_A = "ops-exec-suite-a";
const CO_B = "ops-exec-suite-b";
const MGR_A = { role: "manager", uid: "exec-mgr-a" };
const VIEWER = { role: "viewer", uid: "exec-viewer-a" };
const AGENT = "agent-exec-suite";

const { createAiEmployee } = await import("../services/tenants/aiEmployeeService.js");
const {
    createTask,
    createTaskForAccess,
    getTask,
    getTaskForAccess,
    updateTaskForAccess,
    listTasksForAccess,
} = await import("../services/tenants/taskService.js");
const { enqueueAiTaskExecution } = await import("../services/operations/aiTaskQueue.js");
const { executeAiAssignedTask } = await import("../services/operations/aiTaskExecutor.js");
const { initQueue, shutdownQueue, getQueueBackend } = await import("../services/queue/jobQueue.js");
const { startAiTaskWorker } = await import("../services/queue/workers/aiTaskWorker.js");

await createAiEmployee(CO_A, { id: AGENT, name: "Suite Agent", roleLabel: "Ops" });
await createAiEmployee(CO_B, { id: "agent-other-tenant", name: "Other", roleLabel: "Ops" });

startAiTaskWorker();
await initQueue();

async function expectCode(fn, code) {
    let err;
    try {
        await fn();
    } catch (e) {
        err = e;
    }
    assert.ok(err, `expected ${code}`);
    assert.equal(err.code, code, err?.message);
}

async function waitExec(companyId, taskId, want = "completed", timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const t = await getTask(companyId, taskId);
        if (t?.executionStatus === want) return t;
        if (want === "completed" && t?.executionStatus === "failed") return t;
        await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`timeout waiting ${want} on ${taskId}`);
}

// --- Authorized AI assignment + queue persistence ---
const aiTask = await createTaskForAccess(CO_A, MGR_A, {
    title: "Authorized AI",
    assigneeType: "ai",
    aiEmployeeId: AGENT,
    description: "Run safely",
});
assert.equal(aiTask.executionStatus, "queued");
const backend = await getQueueBackend();
const jobs = backend.listJobs?.() || [];
assert.ok(jobs.some((j) => j.type === "EXECUTE_AI_TASK" && j.companyId === CO_A));

const done = await waitExec(CO_A, aiTask.id, "completed");
assert.ok(done.executionResult?.includes("Suite Agent"));
assert.equal(done.status, "open");
assert.ok(done.activityLog?.some((e) => e.type === "execution_completed"));

// --- Registry guard: unknown AI employee ---
await expectCode(
    () =>
        createTaskForAccess(CO_A, MGR_A, {
            title: "Bad agent",
            assigneeType: "ai",
            aiEmployeeId: "missing-agent-id",
        }),
    "AI_EMPLOYEE_NOT_FOUND"
);

// --- Permissions ---
await expectCode(
    () =>
        createTaskForAccess(CO_A, VIEWER, {
            title: "Viewer AI",
            assigneeType: "ai",
            aiEmployeeId: AGENT,
        }),
    "PERMISSION_DENIED"
);

// --- Tenant isolation ---
const cross = await getTaskForAccess(CO_B, aiTask.id, { role: "manager", uid: "x" });
assert.equal(cross, null, "task id from tenant A must not resolve under tenant B");

// --- Duplicate enqueue ---
const dedupeTask = await createTask(CO_A, {
    title: "Dedupe",
    assigneeType: "ai",
    aiEmployeeId: AGENT,
    executionStatus: "queued",
    status: "open",
});
const j1 = await enqueueAiTaskExecution({ companyId: CO_A, taskId: dedupeTask.id });
const j2 = await enqueueAiTaskExecution({ companyId: CO_A, taskId: dedupeTask.id });
assert.equal(j1.id, j2.id);

// --- Idempotent worker (already completed) ---
const again = await executeAiAssignedTask({ companyId: CO_A, taskId: aiTask.id, jobId: "replay-job" });
assert.equal(again.skipped, true);

// --- Failure (missing agent on system task — no createForAccess guard) ---
const failTask = await createTask(CO_A, {
    title: "Will fail",
    assigneeType: "ai",
    aiEmployeeId: "ghost-agent",
    executionStatus: "queued",
    status: "open",
});
await enqueueAiTaskExecution({ companyId: CO_A, taskId: failTask.id });
const failed = await waitExec(CO_A, failTask.id, "failed");
assert.ok(failed.executionError?.includes("not found"));
assert.ok(failed.activityLog?.some((e) => e.type === "execution_failed"));

// --- Human task + activity on status ---
const human = await createTaskForAccess(CO_A, MGR_A, {
    title: "Human",
    assigneeType: "human",
    assigneeUid: MGR_A.uid,
});
await updateTaskForAccess(CO_A, human.id, MGR_A, { status: "in_progress" });
const humanAfter = await getTask(CO_A, human.id);
assert.equal(humanAfter.status, "in_progress");
assert.ok(humanAfter.activityLog?.some((e) => e.type === "status_changed"));

const humanList = await listTasksForAccess(CO_A, MGR_A);
assert.ok(humanList.some((t) => t.id === human.id));

await shutdownQueue();
console.log("AI_TASK_EXECUTION_SUITE_PASS");
