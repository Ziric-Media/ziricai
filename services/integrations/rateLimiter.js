/**
 * In-memory token bucket rate limiter per companyId + channel.
 */

import { RateLimitError } from "./errors.js";

const buckets = new Map();

const DEFAULT_LIMITS = {
    whatsapp: { capacity: 60, refillPerSec: 1 },
    facebook: { capacity: 30, refillPerSec: 0.5 },
    instagram: { capacity: 30, refillPerSec: 0.5 },
    telegram: { capacity: 30, refillPerSec: 0.5 },
    webchat: { capacity: 100, refillPerSec: 2 },
    email: { capacity: 20, refillPerSec: 0.3 },
    sms: { capacity: 20, refillPerSec: 0.3 },
    default: { capacity: 30, refillPerSec: 0.5 },
};

function bucketKey(companyId, channel) {
    return `${companyId || "_global"}:${channel}`;
}

function getBucket(companyId, channel) {
    const key = bucketKey(companyId, channel);
    if (!buckets.has(key)) {
        const limits = DEFAULT_LIMITS[channel] || DEFAULT_LIMITS.default;
        buckets.set(key, {
            tokens: limits.capacity,
            capacity: limits.capacity,
            refillPerSec: limits.refillPerSec,
            lastRefill: Date.now(),
        });
    }
    return buckets.get(key);
}

function refill(bucket) {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerSec);
    bucket.lastRefill = now;
}

/**
 * Consume one token; throws RateLimitError if exhausted.
 * @param {string} companyId
 * @param {string} channel
 */
export function checkRateLimit(companyId, channel) {
    const bucket = getBucket(companyId, channel);
    refill(bucket);
    if (bucket.tokens < 1) {
        const retryAfterMs = Math.ceil((1 - bucket.tokens) / bucket.refillPerSec * 1000);
        throw new RateLimitError(`Rate limit exceeded for ${channel}`, {
            channel,
            companyId,
            retryAfterMs,
        });
    }
    bucket.tokens -= 1;
}

export function getRateLimitStats(companyId, channel) {
    const bucket = getBucket(companyId, channel);
    refill(bucket);
    return {
        tokens: Math.floor(bucket.tokens),
        capacity: bucket.capacity,
        refillPerSec: bucket.refillPerSec,
    };
}

export function resetRateLimits() {
    buckets.clear();
}
