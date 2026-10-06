/**
 * Stable platform event ids for idempotent ingestion.
 * @param {{ channel: string, companyId: string, messageId: string }} params
 */
export function buildPlatformMessageEventId({ channel, companyId, messageId }) {
    const ch = String(channel || "unknown").trim().toLowerCase();
    const co = String(companyId || "").trim();
    const mid = String(messageId || "").trim();
    if (!co || !mid) {
        throw new Error("companyId and messageId are required for platform event id");
    }
    return `${ch}:${co}:${mid}`;
}

export function rollupDailyDocId(dateUtc, companyId, channel) {
    const d = String(dateUtc || "").trim();
    const co = String(companyId || "").trim();
    const ch = String(channel || "").trim().toLowerCase();
    return `${d}__${co}__${ch}`;
}

export function dailyIdentityDocId(dateUtc, companyId, channel, externalUserId) {
    const uid = String(externalUserId || "")
        .trim()
        .replace(/[/\\#\[\]]/g, "_");
    return `${dateUtc}__${companyId}__${channel}__${uid}`;
}

/** @param {string} isoTimestamp */
export function utcDateKey(isoTimestamp) {
    const t = isoTimestamp ? new Date(isoTimestamp) : new Date();
    if (Number.isNaN(t.getTime())) return new Date().toISOString().slice(0, 10);
    return t.toISOString().slice(0, 10);
}
