/**
 * Failed outbound message retry with exponential backoff.
 */

import { logError, logInfo, logWarn } from "./integrationLogger.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const pendingRetries = [];

/**
 * @typedef {Object} RetryJob
 * @property {string} id
 * @property {string} channel
 * @property {string|null} companyId
 * @property {Function} fn
 * @property {object} ctx
 * @property {object} payload
 * @property {number} attempt
 * @property {number} maxRetries
 */

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Schedule a retry for a failed sendMessage.
 * @param {{ channel: string, companyId?: string|null, fn: Function, ctx: object, payload: object, attempt?: number }} job
 */
export function scheduleRetry({ channel, companyId, fn, ctx, payload, attempt = 0 }) {
    const retryJob = {
        id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channel,
        companyId: companyId || null,
        fn,
        ctx,
        payload,
        attempt,
        maxRetries: MAX_RETRIES,
    };

    pendingRetries.push(retryJob);
    const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
    logWarn(channel, companyId, `Scheduling retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`, {
        to: payload?.to,
    });

    setTimeout(() => executeRetry(retryJob), delayMs);
    return retryJob.id;
}

async function executeRetry(job) {
    const idx = pendingRetries.findIndex((j) => j.id === job.id);
    if (idx >= 0) pendingRetries.splice(idx, 1);

    try {
        logInfo(job.channel, job.companyId, `Retry attempt ${job.attempt + 1}/${job.maxRetries}`, {
            to: job.payload?.to,
        });
        await job.fn(job.ctx, job.payload);
        logInfo(job.channel, job.companyId, "Retry succeeded", { to: job.payload?.to });
    } catch (err) {
        const nextAttempt = job.attempt + 1;
        if (nextAttempt < job.maxRetries) {
            scheduleRetry({ ...job, attempt: nextAttempt });
        } else {
            logError(job.channel, job.companyId, "All retries exhausted", {
                to: job.payload?.to,
                error: err.message,
            });
        }
    }
}

export function getRetryQueueStats() {
    return {
        pending: pendingRetries.length,
        maxRetries: MAX_RETRIES,
        baseDelayMs: BASE_DELAY_MS,
    };
}
