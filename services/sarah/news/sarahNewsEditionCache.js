/**
 * SN-Perf — per-user edition cache (same slot + profile fingerprint).
 */
import { createHash } from "node:crypto";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
/** @type {Map<string, { edition: object, expires: number }>} */
const editionCache = new Map();

function profileFingerprint(profile = {}) {
    const payload = JSON.stringify({
        regions: profile.regions || [],
        interests: profile.interests || [],
        followTopics: profile.followTopics || [],
    });
    return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

export function editionCacheKey(uid, slot, dayKey, profile) {
    return `${uid}:${slot}:${dayKey}:${profileFingerprint(profile)}`;
}

/**
 * @param {string} key
 */
export function getCachedSarahNewsEdition(key) {
    const hit = editionCache.get(key);
    if (!hit || hit.expires <= Date.now()) {
        if (hit) editionCache.delete(key);
        return null;
    }
    return hit.edition;
}

/**
 * @param {string} key
 * @param {object} edition
 * @param {number} [ttlMs]
 */
export function setCachedSarahNewsEdition(key, edition, ttlMs = DEFAULT_TTL_MS) {
    if (!key || !edition) return;
    editionCache.set(key, { edition, expires: Date.now() + ttlMs });
}

export function clearSarahNewsEditionCacheForTests() {
    editionCache.clear();
}