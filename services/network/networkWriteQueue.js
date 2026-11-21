/**
 * SNET-02 — write-through helper for modules that keep a synchronous in-process cache (grants, requests)
 * but must survive restarts: fire the durable write immediately, never throw into request paths, and let
 * tests/shutdown `await flushNetworkWrites()`.
 */
/** @type {Set<Promise<unknown>>} */
const pending = new Set();

/**
 * @param {string} label for the warning log
 * @param {() => Promise<unknown>} fn
 */
export function writeThrough(label, fn) {
    const p = Promise.resolve()
        .then(fn)
        .catch((err) => {
            console.warn(`[networkStore] ${label} write failed:`, err?.message || err);
        })
        .finally(() => pending.delete(p));
    pending.add(p);
    return p;
}

export async function flushNetworkWrites() {
    while (pending.size) await Promise.all([...pending]);
}
