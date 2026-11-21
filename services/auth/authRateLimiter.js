/**
 * Simple in-memory rate limiter for auth-sensitive routes.
 */

const buckets = new Map();

const DEFAULTS = {
    provision: { windowMs: 60_000, max: 10 },
    onboarding: { windowMs: 60_000, max: 20 },
    auth: { windowMs: 60_000, max: 30 },
    "platform-companies": { windowMs: 60_000, max: 30 },
    "platform-integrations": { windowMs: 60_000, max: 20 },
    "health-probe": { windowMs: 60_000, max: 120 },
    /** Anonymous ziricai.com Sarah widget — POST /api/sarah/chat surface=landing */
    "sarah-landing": { windowMs: 60_000, max: 30 },
    /** Anonymous Sarah Network Discover / directory reads (listed entries only). */
    "discover-public": { windowMs: 60_000, max: 60 },
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

/**
 * Client key for unauthenticated public reads. The app does not set `trust proxy`, so `req.ip` would be the
 * platform proxy for every caller; use the right-most X-Forwarded-For hop (appended by the trusted edge, not
 * client-spoofable like the left-most) and fall back to the socket address.
 */
function publicClientKey(req) {
    const xff = String(req.headers["x-forwarded-for"] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return xff.length ? xff[xff.length - 1] : req.socket?.remoteAddress || req.ip || "unknown";
}

/** Per-client rate limit for anonymous public reads (Discover, directory search). */
export function publicReadRateLimit(profile = "discover-public") {
    const limits = DEFAULTS[profile] || DEFAULTS["discover-public"];
    return (req, res, next) => {
        const result = hit(`${profile}:${publicClientKey(req)}`, limits);
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
