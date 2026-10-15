#!/usr/bin/env node
/**
 * Operations AI task queue — reliability verification (memory + optional local Postgres).
 *
 * Usage:
 *   node scripts/verify-ai-task-queue-reliability.mjs
 *   QUEUE_TEST_DATABASE_URL=postgres://127.0.0.1:5432/queue_reliability node scripts/verify-ai-task-queue-reliability.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assessQueueTestDatabaseUrl } from "./lib/queueTestDatabase.mjs";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";
process.env.OPS_QUEUE_RELIABILITY_TEST = "1";
process.env.QUEUE_MAX_ATTEMPTS = "3";
process.env.QUEUE_BASE_DELAY_MS = "25";
process.env.QUEUE_POLL_INTERVAL_MS = "30";

const COMPANY = "ops-reliability-co";
const AGENT = "agent-reliability";
const MGR = { role: "manager", uid: "reliability-mgr" };

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(predicate, { timeoutMs = 12000, intervalMs = 40 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) return;
        await sleep(intervalMs);
    }
    throw new Error("Timed out waiting for condition");
}

async function setupMemoryQueue() {
    delete process.env.DATABASE_URL;
    const { shutdownQueue } = await import("../services/queue/jobQueue.js");
    await shutdownQueue();

    const { createAiEmployee } = await import("../services/tenants/aiEmployeeService.js");
    await createAiEmployee(COMPANY, { id: AGENT, name: "Reliability Agent", roleLabel: "Ops" });

    const { startAiTaskWorker } = await import("../services/queue/workers/aiTaskWorker.js");
    const { initQueue } = await import("../services/queue/jobQueue.js");
    startAiTaskWorker();
    await initQueue();
}

async function testTransientThenSuccess() {
    console.log("— transient failures then success (memory)");
    process.env.OPS_QUEUE_TEST_TRANSIENT_FAILS = "2";

    const { TRANSIENT_TITLE } = await import("../services/operations/aiTaskReliabilityTest.js");
    const { createTask, getTask } = await import("../services/tenants/taskService.js");
    const { enqueueAiTaskExecution } = await import("../services/operations/aiTaskQueue.js");
    const { getQueueBackend, JOB_STATES } = await import("../services/queue/jobQueue.js");

    const task = await createTask(COMPANY, {
        title: TRANSIENT_TITLE,
        assigneeType: "ai",
        aiEmployeeId: AGENT,
        executionStatus: "queued",
        status: "open",
    });
    const job = await enqueueAiTaskExecution({ companyId: COMPANY, taskId: task.id });

    await waitFor(async () => {
        const t = await getTask(COMPANY, task.id);
        return t?.executionStatus === "completed";
    });

    const finalTask = await getTask(COMPANY, task.id);
    assert.equal(finalTask.executionStatus, "completed");
    assert.ok(finalTask.executionResult?.includes("Reliability Agent"));
    assert.ok(finalTask.activityLog?.some((e) => e.type === "execution_retry_pending"));
    assert.notEqual(finalTask.status, "done");

    const backend = await getQueueBackend();
    const row = backend.listJobs().find((j) => j.id === job.id);
    assert.equal(row?.status, JOB_STATES.COMPLETED);
    assert.equal(row?.attempt, 3, "expected 2 transient fails + 1 success claim");

    console.log("  PASS transient→success");
}

async function testRetryExhaustion() {
    console.log("— retry exhaustion + terminal task state (memory)");
    process.env.OPS_QUEUE_TEST_TRANSIENT_FAILS = "99";

    const { TRANSIENT_TITLE } = await import("../services/operations/aiTaskReliabilityTest.js");
    const { createTask, getTask } = await import("../services/tenants/taskService.js");
    const { enqueueAiTaskExecution } = await import("../services/operations/aiTaskQueue.js");
    const { getQueueBackend, JOB_STATES } = await import("../services/queue/jobQueue.js");

    const task = await createTask(COMPANY, {
        title: TRANSIENT_TITLE,
        assigneeType: "ai",
        aiEmployeeId: AGENT,
        executionStatus: "queued",
        status: "open",
    });
    const job = await enqueueAiTaskExecution({ companyId: COMPANY, taskId: task.id });

    await waitFor(async () => {
        const backend = await getQueueBackend();
        const row = backend.listJobs().find((j) => j.id === job.id);
        return row?.status === JOB_STATES.FAILED;
    });

    const finalTask = await getTask(COMPANY, task.id);
    assert.equal(finalTask.executionStatus, "failed");
    assert.notEqual(finalTask.executionStatus, "in_progress");
    assert.ok(finalTask.executionError?.includes("simulated transient"));
    assert.ok(finalTask.activityLog?.some((e) => e.type === "execution_failed"));

    const backend = await getQueueBackend();
    const row = backend.listJobs().find((j) => j.id === job.id);
    assert.equal(row?.status, JOB_STATES.FAILED);
    assert.equal(row?.attempt, 3);

    console.log("  PASS retry exhaustion (job FAILED, task synced to failed, not stuck in_progress)");
}

async function testCompletedIdempotent() {
    console.log("— completed execution idempotent skip (memory)");
    process.env.OPS_QUEUE_TEST_TRANSIENT_FAILS = "0";

    const { createTaskForAccess, getTask } = await import("../services/tenants/taskService.js");
    const { executeAiAssignedTask } = await import("../services/operations/aiTaskExecutor.js");

    const task = await createTaskForAccess(COMPANY, MGR, {
        title: "Stable complete",
        assigneeType: "ai",
        aiEmployeeId: AGENT,
    });
    await waitFor(async () => (await getTask(COMPANY, task.id))?.executionStatus === "completed");

    const skip = await executeAiAssignedTask({ companyId: COMPANY, taskId: task.id, jobId: "x" });
    assert.equal(skip.skipped, true);
    assert.equal(skip.reason, "already_completed");

    console.log("  PASS idempotent skip when already completed");
}

async function testStaleLeaseRecoveryAndFencing() {
    console.log("— stale lease recovery + stale claim token fencing (memory)");
    process.env.QUEUE_PROCESSING_LEASE_MS = "40";

    const { createMemoryBackend } = await import("../services/queue/backends/memoryBackend.js");
    const { JOB_TYPES, JOB_STATES } = await import("../services/queue/jobQueue.js");

    const mem = createMemoryBackend();
    const { job } = mem.enqueue({
        type: JOB_TYPES.EXECUTE_AI_TASK,
        companyId: COMPANY,
        taskId: `stale-${randomUUID()}`,
        externalMessageId: `ai-task-exec:${COMPANY}:stale-${randomUUID()}`,
        channel: "operations",
    });
    const claimed = mem.claimNext();
    assert.ok(claimed?.claimToken);
    const staleToken = claimed.claimToken;

    assert.equal(mem.claimNext(), null);
    await sleep(50);
    const { recovered } = mem.recoverStaleLeases(40);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, JOB_STATES.RETRYING);

    const rejected = mem.completeJob(job.id, {}, { claimToken: staleToken });
    assert.equal(rejected, null, "stale worker must not complete after lease recovery");

    console.log("  PASS stale lease → retrying; stale claimToken completion rejected");
}

async function testHumanRegression() {
    console.log("— human task regression (memory)");
    const { createTaskForAccess, updateTaskForAccess, listTasksForAccess } = await import(
        "../services/tenants/taskService.js"
    );
    const human = await createTaskForAccess(COMPANY, MGR, {
        title: "Human reliability",
        assigneeType: "human",
        assigneeUid: MGR.uid,
    });
    await updateTaskForAccess(COMPANY, human.id, MGR, { status: "in_progress" });
    const list = await listTasksForAccess(COMPANY, MGR);
    assert.ok(list.some((t) => t.id === human.id && t.status === "in_progress"));
    console.log("  PASS human create/list/update unchanged");
}

async function testPostgresIntegration() {
    const url = process.env.QUEUE_TEST_DATABASE_URL || process.env.DATABASE_URL;
    const gate = assessQueueTestDatabaseUrl(url);
    if (!gate.ok) {
        console.log(`POSTGRES_QUEUE_RELIABILITY_SKIP — ${gate.reason}`);
        return;
    }

    console.log(`— Postgres integration (${gate.reason})`);
    process.env.QUEUE_BASE_DELAY_MS = "10";
    process.env.QUEUE_PROCESSING_LEASE_MS = "50";
    const { createPostgresBackend } = await import("../services/queue/backends/postgresBackend.js");
    const { JOB_TYPES } = await import("../services/queue/jobQueue.js");

    const workerA = createPostgresBackend(url);
    const workerB = createPostgresBackend(url);
    await workerA.init();
    await workerB.init();

    const ext = `ai-task-exec:${COMPANY}:pg-${randomUUID()}`;
    const payload = {
        type: JOB_TYPES.EXECUTE_AI_TASK,
        companyId: COMPANY,
        taskId: `pg-task-${randomUUID()}`,
        channel: "operations",
        externalMessageId: ext,
    };

    const [e1, e2] = await Promise.all([workerA.enqueue(payload), workerB.enqueue({ ...payload })]);
    assert.equal(e1.duplicate, false);
    assert.equal(e2.duplicate, true, "simultaneous duplicate enqueue should dedupe");
    assert.equal(e1.job.id, e2.job.id);

    const [c1, c2] = await Promise.all([workerA.claimNext(), workerB.claimNext()]);
    const claims = [c1, c2].filter(Boolean);
    assert.equal(claims.length, 1, "concurrent claimNext must yield exactly one worker");

    await workerA.completeJob(claims[0].id);

    const stale = await workerA.enqueue({
        ...payload,
        externalMessageId: `ai-task-exec:${COMPANY}:stale-${randomUUID()}`,
        taskId: `stale-${randomUUID()}`,
    });
    await workerA.claimNext();
    const stuckId = stale.job.id;
    await sleep(60);
    const { recovered: pgRecovered } = await workerA.recoverStaleLeases(50);
    assert.ok(pgRecovered.length >= 1, "postgres stale lease recovery should re-queue job");

    await sleep(15);
    const reclaimed = await workerB.claimNext();
    assert.ok(reclaimed, "recovered job should be claimable when next_run_at is due");

    await workerA.shutdown();
    await workerB.shutdown();

    console.log("  PASS concurrent dedupe + single claim + stale lease recovery");
}

async function main() {
    console.log("\nAI task queue reliability verification\n");

    await setupMemoryQueue();
    await testTransientThenSuccess();
    await testRetryExhaustion();
    await testCompletedIdempotent();
    await testStaleLeaseRecoveryAndFencing();
    await testHumanRegression();

    const { shutdownQueue } = await import("../services/queue/jobQueue.js");
    await shutdownQueue();

    await testPostgresIntegration();

    console.log("\nAI_TASK_QUEUE_RELIABILITY_PASS\n");
}

main().catch((err) => {
    console.error("\nAI_TASK_QUEUE_RELIABILITY_FAIL:", err.message);
    console.error(err.stack);
    process.exit(1);
});
