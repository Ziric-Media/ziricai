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
