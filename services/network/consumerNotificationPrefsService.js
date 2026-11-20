/**
 * SNA-01E — consumer-wide notification preferences (inbox rows are always written; push honours these + quiet hours).
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_NOTIFICATION_PREFS);

export const GLOBAL_PREF_KEYS = Object.freeze([
    "orgNotifications",
    "announcements",
    "workCompletions",
    "reminders",
    "usageAlerts",
    "newsBriefings",
    "newsBreaking",
    "quietHours",
]);

const CHANNEL_PREF = Object.freeze({
    notifications: "orgNotifications",
    announcements: "announcements",
    reminders: "reminders",
    sarah_reminder: "reminders",
    sarah_work: "workCompletions",
    sarah_usage: "usageAlerts",
    sarah_news_briefing: "newsBriefings",
    sarah_news_breaking: "newsBreaking",
});

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function docId(uid) {
    return `cnp_${uid}`;
}

export function defaultConsumerNotificationPrefs() {
    return {
        orgNotifications: true,
        announcements: true,
        workCompletions: true,
        reminders: true,
        usageAlerts: true,
        newsBriefings: true,
        newsBreaking: true,
        quietHours: false,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        /** Minutes east of UTC (e.g. South Africa ≈ 120). */
        timezoneOffsetMinutes: 0,
    };
}

function normalizePrefs(stored = {}) {
    const base = defaultConsumerNotificationPrefs();
    const out = { ...base };
    for (const k of GLOBAL_PREF_KEYS) {
        if (stored[k] !== undefined) out[k] = Boolean(stored[k]);
    }
    if (stored.quietHoursStart !== undefined) out.quietHoursStart = Math.min(23, Math.max(0, Number(stored.quietHoursStart) || 22));
    if (stored.quietHoursEnd !== undefined) out.quietHoursEnd = Math.min(23, Math.max(0, Number(stored.quietHoursEnd) || 7));
    if (stored.timezoneOffsetMinutes !== undefined) {
        const n = Number(stored.timezoneOffsetMinutes);
        if (Number.isFinite(n)) out.timezoneOffsetMinutes = Math.min(840, Math.max(-840, Math.round(n)));
    }
    return out;
}

/** @param {string} uid */
export async function getConsumerNotificationPrefs(uid) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const row = await col.get(docId(uid));
    return { prefs: normalizePrefs(row || {}) };
}

/**
 * @param {string} uid
 * @param {Record<string, unknown>} patch
 */
export async function updateConsumerNotificationPrefs(uid, patch = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const unknown = Object.keys(patch || {}).filter(
        (k) =>
            !GLOBAL_PREF_KEYS.includes(k) &&
            !["quietHoursStart", "quietHoursEnd", "timezoneOffsetMinutes"].includes(k)
    );
    if (unknown.length) throw err(422, "PREFS_INVALID", `Unknown preference: ${unknown.join(", ")}`);
    for (const k of GLOBAL_PREF_KEYS) {
        if (patch[k] !== undefined && typeof patch[k] !== "boolean") {
            throw err(422, "PREFS_INVALID", `Preference "${k}" must be true or false.`);
        }
    }
    const existing = normalizePrefs((await col.get(docId(uid))) || {});
    const merged = normalizePrefs({ ...existing, ...patch });
    const now = new Date().toISOString();
    await col.put(
        docId(uid),
        {
            uid,
            ...merged,
            updatedAt: now,
            schemaVersion: 1,
        },
        { merge: false }
    );
    return { prefs: merged };
}

/**
 * Whether FCM push should be attempted for this channel (in-app delivery is separate).
 * @param {ReturnType<typeof defaultConsumerNotificationPrefs>} prefs
 * @param {string} [channel]
 * @param {Date} [now]
 */
export function shouldDeliverPushForPrefs(prefs, channel, now = new Date()) {
    const key = channel ? CHANNEL_PREF[channel] : null;
    if (key && prefs[key] === false) return false;
    if (!prefs.quietHours) return true;
    const offset = Number(prefs.timezoneOffsetMinutes) || 0;
    const localMs = now.getTime() + offset * 60_000;
    const h = new Date(localMs).getUTCHours();
    const start = Number(prefs.quietHoursStart) ?? 22;
    const end = Number(prefs.quietHoursEnd) ?? 7;
    if (start > end) return !(h >= start || h < end);
    return !(h >= start && h < end);
}

/** @param {string} uid @param {string} [channel] */
export async function shouldDeliverPushToUser(uid, channel) {
    if (!uid) return false;
    const { prefs } = await getConsumerNotificationPrefs(uid);
    return shouldDeliverPushForPrefs(prefs, channel);
}

export function clearConsumerNotificationPrefsForTests() {
    col.clearMemory();
}
