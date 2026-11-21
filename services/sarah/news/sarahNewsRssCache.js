/**
 * SN-Perf — short-lived RSS response cache (shared across users per feed URL).
 */
import { fetchRssFeed } from "./sarahNewsRss.js";

const DEFAULT_TTL_MS = 4 * 60 * 1000;
/** @type {Map<string, { items: object[], expires: number }>} */
const feedCache = new Map();

/**
 * @param {string} url
 * @param {{ ttlMs?: number, timeoutMs?: number }} [opts]
 */
export async function fetchRssFeedCached(url, opts = {}) {
    const key = String(url || "").trim();
    if (!key) return [];
    const ttl = Math.min(Math.max(Number(opts.ttlMs) || DEFAULT_TTL_MS, 30_000), 15 * 60 * 1000);
    const hit = feedCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.items;

    const items = await fetchRssFeed(key, { timeoutMs: opts.timeoutMs ?? 7000 });
    feedCache.set(key, { items, expires: Date.now() + ttl });
    return items;
}

export function clearSarahNewsRssCacheForTests() {
    feedCache.clear();
}