/**
 * Pluggable async job queue — in-memory (dev) or Postgres (production durable).
 * Enqueue API stable for future BullMQ/SQS swap.
 */
import { createQueueBackend } from "./backends/index.js";
import { queueConcurrency, queuePollIntervalMs, resolveQueueBackendName } from "./queueConfig.js";
import { JOB_STATES } from "./jobStates.js";

const JOB_TYPES = {
    PROCESS_INBOUND_MESSAGE: "PROCESS_INBOUND_MESSAGE",
    PROCESS_EVENT: "PROCESS_EVENT",
};

/** @type {Map<string, Function>} */
const handlers = new Map();
/** @type {import('./backends/memoryBackend.js').createMemoryBackend extends Function ? ReturnType<typeof import('./backends/memoryBackend.js').createMemoryBackend> : object} */
let backend = null;
let activeJobs = 0;
let pollTimer = null;
let initialized = false;

function logJob(event, job, extra = {}) {
    console.log(`[queue] ${event}`, {
        jobId: job.id,
        jobType: job.type,
        status: job.status,
        companyId: job.companyId || null,
        customerId: job.customerId || null,
        conversationId: job.conversationId || null,
        channel: job.channel || null,
        externalMessageId: job.externalMessageId
            ? String(job.externalMessageId).slice(0, 24)
            : null,
        attempt: job.attempt,
        ...extra,
    });
}

async function runJob(job) {
    const handler = handlers.get(job.type);
    if (!handler) {
        console.error("[queue] No handler for job type:", job.type);
        await backend.scheduleRetry(job.id, `No handler for ${job.type}`);
        return;
    }

    logJob("Processing", job);

    try {
        await handler(job);
        const completed = await backend.completeJob(job.id, {
            outboundSent: job.outboundSent,
            outboundMetaMessageId: job.outboundMetaMessageId,
            outboundPlanSent: job.outboundPlanSent,
            outboundMetaMessageIds: job.outboundMetaMessageIds,
        });
        if (completed) logJob("Completed", completed);

        if (job.type === JOB_TYPES.PROCESS_INBOUND_MESSAGE && job.externalMessageId) {
            const { markInboundMessageProcessed } = await import("../conversationService.js");
            await markInboundMessageProcessed(job.externalMessageId, {
                from: job.from || job.phone,
                companyId: job.companyId,
                channel: job.channel,
                jobId: job.id,
            });
        }
    } catch (err) {
        const message = err?.message || String(err);
        const updated = await backend.scheduleRetry(job.id, message);
        if (updated?.status === JOB_STATES.FAILED) {
            logJob("Failed permanently", updated, { error: message });
            if (job.type === JOB_TYPES.PROCESS_INBOUND_MESSAGE && job.externalMessageId) {
                const { releaseInboundClaim } = await import("../conversationService.js");
                await releaseInboundClaim(job.externalMessageId);
            }
        } else if (updated) {
            logJob("Retry scheduled", updated, { error: message });
        } else {
            console.error("[queue] Job failed:", job.id, job.type, message);
        }
    }
}

function schedulePoll() {
    if (pollTimer) return;
    pollTimer = setInterval(tick, queuePollIntervalMs());
    if (pollTimer.unref) pollTimer.unref();
}

async function tick() {
    if (!backend || activeJobs >= queueConcurrency()) return;

    while (activeJobs < queueConcurrency()) {
        const job = await backend.claimNext();
        if (!job) break;

        activeJobs++;
        Promise.resolve()
            .then(() => runJob(job))
            .finally(() => {
                activeJobs--;
            });
    }
}

export async function initQueue() {
    if (initialized) return backend;
    backend = await createQueueBackend();
    await backend.init();
    initialized = true;
    schedulePoll();
    console.log("[queue] Initialized", {
        backend: backend.name,
        configured: resolveQueueBackendName(),
        concurrency: queueConcurrency(),
    });
    return backend;
}

export function registerJobHandler(type, fn) {
    handlers.set(type, fn);
}

export async function enqueue(payload) {
    if (!backend) await initQueue();

    const enriched = {
        enqueuedAt: Date.now(),
        ...payload,
        externalMessageId: payload.externalMessageId || payload.externalId || null,
    };

    const { job, duplicate } = await backend.enqueue(enriched);
    if (duplicate) {
        logJob("Duplicate skipped", job, { reason: "active_job_or_wamid" });
    } else {
        logJob("Enqueued", job, { depth: (await backend.getStats()).pending });
    }
    tick().catch((err) => console.error("[queue] tick error:", err.message));
    return job;
}

export async function markJobOutboundSent(jobId, metaMessageId, extra = {}) {
    if (!backend) return null;
    return backend.markOutboundSent(jobId, metaMessageId, extra);
}

export async function getQueueStats() {
    if (!backend) {
        return {
            pending: 0,
            active: 0,
            retrying: 0,
            concurrency: queueConcurrency(),
            backend: resolveQueueBackendName(),
            initialized: false,
        };
    }
    const stats = await backend.getStats();
    return {
        ...stats,
        active: Math.max(stats.active || 0, activeJobs),
        concurrency: queueConcurrency(),
        initialized: true,
    };
}

export async function getQueueBackend() {
    if (!backend) await initQueue();
    return backend;
}

export async function shutdownQueue() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (backend?.shutdown) await backend.shutdown();
    backend = null;
    initialized = false;
}

/** @internal Test helper — inject a restored in-memory backend after simulated restart. */
export async function injectQueueBackendForTests(testBackend) {
    await shutdownQueue();
    backend = testBackend;
    await backend.init();
    initialized = true;
    schedulePoll();
}

export { JOB_TYPES, JOB_STATES };
