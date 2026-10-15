/** Shared queue tuning — env overrides with safe defaults. */
export function queueConcurrency() {
    const n = parseInt(process.env.QUEUE_CONCURRENCY || "1", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

export function queueMaxAttempts() {
    const n = parseInt(process.env.QUEUE_MAX_ATTEMPTS || "5", 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
}

export function queueBaseDelayMs() {
    const n = parseInt(process.env.QUEUE_BASE_DELAY_MS || "1000", 10);
    return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function queuePollIntervalMs() {
    const n = parseInt(process.env.QUEUE_POLL_INTERVAL_MS || "250", 10);
    return Number.isFinite(n) && n >= 50 ? n : 250;
}

export function resolveQueueBackendName() {
    if (process.env.DATABASE_URL) return "postgres";
    if (process.env.REDIS_URL) return "redis";
    return "memory";
}

/** Max time a job may stay in `processing` before lease recovery (ms). */
export function queueProcessingLeaseMs() {
    const n = parseInt(process.env.QUEUE_PROCESSING_LEASE_MS || "120000", 10);
    const raw = Number.isFinite(n) && n > 0 ? n : 120000;
    const testMode =
        process.env.OPS_QUEUE_RELIABILITY_TEST === "1" || process.env.NODE_ENV === "test";
    const floor = testMode ? 50 : 30_000;
    const ceiling = 86_400_000;
    return Math.min(ceiling, Math.max(floor, raw));
}
