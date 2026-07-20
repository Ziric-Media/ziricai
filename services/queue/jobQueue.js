/**
 * In-process async job queue (MVP).
 * Designed for future swap to BullMQ, SQS, or Redis without changing enqueue API.
 */
import { randomUUID } from "crypto";

const JOB_TYPES = {
    PROCESS_INBOUND_MESSAGE: "PROCESS_INBOUND_MESSAGE",
    PROCESS_EVENT: "PROCESS_EVENT",
};

const queue = [];
const handlers = new Map();
let activeJobs = 0;
let draining = false;

function concurrency() {
    const n = parseInt(process.env.QUEUE_CONCURRENCY || "1", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function drain() {
    if (draining) return;
    draining = true;

    const tick = () => {
        while (activeJobs < concurrency() && queue.length > 0) {
            const job = queue.shift();
            const handler = handlers.get(job.type);
            if (!handler) {
                console.error("[queue] No handler for job type:", job.type);
                continue;
            }
            activeJobs++;
            Promise.resolve()
                .then(() => handler(job))
                .catch((err) => {
                    console.error("[queue] Job failed:", job.id, job.type, err.message || err);
                })
                .finally(() => {
                    activeJobs--;
                    setImmediate(tick);
                });
        }
        draining = false;
    };

    setImmediate(tick);
}

export function registerJobHandler(type, fn) {
    handlers.set(type, fn);
}

export function enqueue(payload) {
    const job = {
        id: randomUUID(),
        enqueuedAt: Date.now(),
        ...payload,
    };
    queue.push(job);
    console.log("[queue] Enqueued", job.type, job.id, "depth:", queue.length);
    drain();
    return job;
}

export function getQueueStats() {
    return {
        pending: queue.length,
        active: activeJobs,
        concurrency: concurrency(),
    };
}

export { JOB_TYPES };
