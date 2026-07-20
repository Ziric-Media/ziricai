/**
 * Simple in-memory rate limiter for auth-sensitive routes.
 */

const buckets = new Map();

const DEFAULTS = {
    provision: { windowMs: 60_000, max: 10 },
    onboarding: { windowMs: 60_000, max: 20 },
    auth: { windowMs: 60_000, max: 30 },
};

function hit(key, { windowMs, max }) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
        bucket = { start: now, count: 0 };
        buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
        const retryAfterSec = Math.ceil((windowMs - (now - bucket.start)) / 1000);
        return { limited: true, retryAfterSec };
    }
    return { limited: false };
}

function clientKey(req) {
    return req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
}

/**
 * @param {'provision'|'onboarding'|'auth'} profile
 */
export function authRateLimit(profile = "auth") {
    const limits = DEFAULTS[profile] || DEFAULTS.auth;
    return (req, res, next) => {
        const key = `${profile}:${clientKey(req)}`;
        const result = hit(key, limits);
        if (result.limited) {
            res.setHeader("Retry-After", String(result.retryAfterSec));
            return res.status(429).json({
                error: "Too many requests — try again shortly",
                code: "RATE_LIMITED",
                retryAfterSec: result.retryAfterSec,
            });
        }
        next();
    };
}

export function resetAuthRateLimits() {
    buckets.clear();
}
