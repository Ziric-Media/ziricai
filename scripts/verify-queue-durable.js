#!/usr/bin/env node
/**
 * Durable job queue verification — restart survival, retry/backoff, wamid idempotency.
 *
 * Usage:
 *   node scripts/verify-queue-durable.js
 *   DATABASE_URL=postgres://... node scripts/verify-queue-durable.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.QUEUE_MAX_ATTEMPTS = process.env.QUEUE_MAX_ATTEMPTS || "3";
process.env.QUEUE_BASE_DELAY_MS = process.env.QUEUE_BASE_DELAY_MS || "50";
process.env.QUEUE_POLL_INTERVAL_MS = process.env.QUEUE_POLL_INTERVAL_MS || "25";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 25 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) return;
        await sleep(intervalMs);
    }
    throw new Error("Timed out waiting for condition");
}

async function testInboundClaimTiming() {
    const { isInboundMessageProcessed, tryClaimInboundMessage, markInboundMessageProcessed, releaseInboundClaim } =
        await import("../services/conversationService.js");

    const wamid = "wamid.claim.timing.test";
    assert(!(await isInboundMessageProcessed(wamid)), "Fresh wamid not processed");
    assert(await tryClaimInboundMessage(wamid), "First claim succeeds");
    assert(!(await tryClaimInboundMessage(wamid)), "Second claim blocked while in-flight");
    assert(!(await isInboundMessageProcessed(wamid)), "Not marked processed until worker completes");
    await markInboundMessageProcessed(wamid, { from: "27810000003" });
    assert(await isInboundMessageProcessed(wamid), "Processed after worker success");
    await releaseInboundClaim(wamid);
    assert(await isInboundMessageProcessed(wamid), "Release does not undo completed mark");

    console.log("✓ wamid claimed at ingest, marked only after success");
}

async function testOutboundIdempotency() {
    const { markJobOutboundSent, shutdownQueue } = await import("../services/queue/jobQueue.js");
    const { createMemoryBackend } = await import("../services/queue/backends/memoryBackend.js");

    await shutdownQueue();
    const mem = createMemoryBackend();
    const { job } = mem.enqueue({
        type: "PROCESS_INBOUND_MESSAGE",
        companyId: "demo-co",
        channel: "whatsapp",
        externalMessageId: "wamid.outbound.test",
    });

    await mem.markOutboundSent(job.id, "wamid.outbound.sent");
    const updated = mem.listJobs().find((r) => r.id === job.id);
    assert(updated?.outboundSent === true, "Outbound flag persisted on job");
    assert(updated?.outboundMetaMessageId === "wamid.outbound.sent", "Meta message id stored");

    const again = await markJobOutboundSent(job.id, "wamid.outbound.sent");
    assert(again === null, "markJobOutboundSent requires initialized queue backend");

    console.log("✓ Outbound send tracked on job for retry idempotency");
}

async function testRetryAndPermanentFailure() {
    const {
        initQueue,
        enqueue,
        registerJobHandler,
        getQueueBackend,
        shutdownQueue,
        JOB_TYPES,
        JOB_STATES,
    } = await import("../services/queue/jobQueue.js");

    await shutdownQueue();
    delete process.env.DATABASE_URL;

    let attempts = 0;
    registerJobHandler(JOB_TYPES.PROCESS_EVENT, async () => {
        attempts++;
        throw new Error(`simulated failure ${attempts}`);
    });

    await initQueue();
    const job = await enqueue({
        type: JOB_TYPES.PROCESS_EVENT,
        companyId: "demo-co",
        event: { type: "test", companyId: "demo-co" },
    });

    await waitFor(async () => {
        const backend = await getQueueBackend();
        const rows = backend.listJobs();
        const row = rows.find((r) => r.id === job.id);
        return row?.status === JOB_STATES.FAILED;
    }, { timeoutMs: 8000 });

    const backend = await getQueueBackend();
    const failed = backend.listJobs().find((r) => r.id === job.id);
    assert(failed?.status === JOB_STATES.FAILED, "Job should reach failed state");
    assert(attempts === 3, `Expected 3 attempts, got ${attempts}`);

    console.log("✓ Exponential retry stops at max attempts");
}

async function testRestartSurvival() {
    const {
        registerJobHandler,
        enqueue,
        injectQueueBackendForTests,
        shutdownQueue,
        JOB_TYPES,
        JOB_STATES,
    } = await import("../services/queue/jobQueue.js");
    const { createMemoryBackend } = await import("../services/queue/backends/memoryBackend.js");

    await shutdownQueue();
    delete process.env.DATABASE_URL;

    const mem = createMemoryBackend();
    const { job } = mem.enqueue({
        type: JOB_TYPES.PROCESS_INBOUND_MESSAGE,
        companyId: "demo-co",
        customerId: "27810000001",
        conversationId: "whatsapp::27810000001",
        channel: "whatsapp",
        externalMessageId: "wamid.restart.test",
        phone: "27810000001",
        from: "27810000001",
        text: "restart test",
        messageType: "text",
    });

    const raw = mem.listJobs()[0];
    const restarted = createMemoryBackend();
    restarted.restoreJobs([
        {
            id: raw.id,
            type: raw.type,
            status: JOB_STATES.QUEUED,
            payload: {
                type: raw.type,
                companyId: raw.companyId,
                customerId: raw.customerId,
                conversationId: raw.conversationId,
                channel: raw.channel,
                externalMessageId: raw.externalMessageId,
                phone: raw.phone,
                from: raw.from,
                text: raw.text,
                messageType: raw.messageType,
            },
            companyId: raw.companyId,
            customerId: raw.customerId,
            conversationId: raw.conversationId,
            channel: raw.channel,
            externalMessageId: raw.externalMessageId,
            attempt: 0,
            maxAttempts: 3,
            enqueuedAt: raw.enqueuedAt,
            startedAt: null,
            completedAt: null,
            nextRunAt: Date.now(),
            lastError: null,
            outboundSent: false,
            outboundMetaMessageId: null,
        },
    ]);

    const processed = [];
    registerJobHandler(JOB_TYPES.PROCESS_INBOUND_MESSAGE, async (j) => {
        processed.push(j.id);
    });

    await injectQueueBackendForTests(restarted);
    await waitFor(() => processed.length === 1);
    assert(processed[0] === job.id, "Restored queued job should run after simulated restart");

    console.log("✓ Queued job survives simulated restart");
}

async function testWhatsAppDuplicateResponse() {
    const { ingest } = await import("../services/integrations/conversationPipeline.js");
    const { isInboundMessageProcessed } = await import("../services/conversationService.js");
    const { shutdownQueue, initQueue, registerJobHandler, JOB_TYPES } =
        await import("../services/queue/jobQueue.js");

    await shutdownQueue();
    delete process.env.DATABASE_URL;
    process.env.WHATSAPP_DEV_MODE = "true";

    let aiReplies = 0;
    registerJobHandler(JOB_TYPES.PROCESS_INBOUND_MESSAGE, async () => {
        aiReplies++;
    });
    await initQueue();

    const message = {
        channel: "whatsapp",
        companyId: "demo-co",
        from: "27810000004",
        text: "Hello duplicate test",
        externalId: "wamid.duplicate.response.test",
        metadata: { messageType: "text" },
        timestamp: new Date().toISOString(),
    };

    const first = await ingest(message);
    assert(first.duplicate !== true, "First ingest accepted");
    await waitFor(() => aiReplies === 1);
    await waitFor(() => isInboundMessageProcessed(message.externalId));

    const second = await ingest(message);
    assert(second.duplicate === true, "Duplicate webhook delivery skipped");
    assert(aiReplies === 1, "Single AI handler run for duplicate wamid");

    console.log("✓ WhatsApp duplicate webhook → single AI response");
}

async function main() {
    console.log("\nDurable queue verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);
    console.log(`DATABASE_URL=${process.env.DATABASE_URL ? "(set)" : "(unset — memory backend)"}\n`);

    await testInboundClaimTiming();
    await testOutboundIdempotency();
    await testRetryAndPermanentFailure();
    await testRestartSurvival();
    await testWhatsAppDuplicateResponse();

    const { shutdownQueue } = await import("../services/queue/jobQueue.js");
    await shutdownQueue();

    console.log("\nAll durable queue checks passed.\n");
}

main().catch((err) => {
    console.error("\nQueue verification failed:", err.message);
    process.exit(1);
});
