/**
 * Normalize Firestore Timestamp, ISO string, Date, or {_seconds} values for sorting/serialization.
 */

/**
 * @param {unknown} ts
 * @returns {number}
 */
export function timestampToMillis(ts) {
    if (ts == null) return 0;
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") {
        const ms = Date.parse(ts);
        return Number.isNaN(ms) ? 0 : ms;
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "object") {
        if (typeof ts.toDate === "function") return ts.toDate().getTime();
        if (ts._seconds != null) return ts._seconds * 1000;
        if (ts.seconds != null) return ts.seconds * 1000;
    }
    const ms = Date.parse(String(ts));
    return Number.isNaN(ms) ? 0 : ms;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareTimestampsDesc(a, b) {
    return timestampToMillis(b) - timestampToMillis(a);
}

/**
 * @param {unknown} ts
 * @returns {string|null}
 */
export function toIsoTimestamp(ts) {
    if (ts == null) return null;
    if (typeof ts === "string") return ts;
    const ms = timestampToMillis(ts);
    if (!ms) return null;
    return new Date(ms).toISOString();
}
