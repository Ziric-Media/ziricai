/**
 * Format Firestore / mixed consumer profile timestamps for MC display.
 */
import { profileTimestampMs } from "../users/consumerProfileService.js";

/**
 * @param {object} profile
 * @param {string} field
 * @returns {string|null} ISO string or null
 */
export function formatConsumerFieldTime(profile, field) {
    const ms = profileTimestampMs(profile, field);
    if (ms != null) return new Date(ms).toISOString();
    const v = profile?.[field];
    if (v == null) return null;
    if (typeof v === "string") {
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : new Date(t).toISOString();
    }
    if (typeof v === "object" && v._seconds != null) {
        return new Date(Number(v._seconds) * 1000).toISOString();
    }
    return null;
}

/**
 * Short human date for MC tables (YYYY-MM-DD or em dash).
 * @param {string|null|undefined} iso
 */
export function formatConsumerDateShort(iso) {
    if (!iso) return "—";
    const s = String(iso);
    if (s.length >= 10) return s.slice(0, 10);
    return s;
}