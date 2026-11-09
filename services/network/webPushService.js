/**
 * Phase 2.1 — deliver subscriber notifications to FCM when configured.
 * Without FCM_SERVER_KEY the send is a no-op (in-app poll unchanged).
 */
import { listConsentedPushTokens } from "./pushDeviceService.js";

/** @type {Array<{ uid: string, title: string, body: string, at: string }>} */
const testLog = [];

export function drainPushAttemptsForTests() {
    return testLog.splice(0, testLog.length);
}

function fcmKey() {
    return String(process.env.FCM_SERVER_KEY || "").trim();
}

/**
 * @param {string} uid
 * @param {{ title: string, body?: string, notificationId?: string, snId?: string }} payload
 */
export async function sendPushToUser(uid, payload) {
    const tokens = await listConsentedPushTokens(uid);
    if (!tokens.length) return { sent: 0, skipped: "no_devices" };
    const key = fcmKey();
    const record = { uid, title: payload.title, body: payload.body || "", at: new Date().toISOString() };
    if (!key) {
        testLog.push(record);
        return { sent: 0, skipped: "fcm_not_configured", wouldSend: tokens.length };
    }
    let sent = 0;
    for (const token of tokens) {
        try {
            const res = await fetch("https://fcm.googleapis.com/fcm/send", {
                method: "POST",
                headers: { "content-type": "application/json", Authorization: `key=${key}` },
                body: JSON.stringify({
                    to: token,
                    notification: { title: payload.title, body: payload.body || "" },
                    data: {
                        notificationId: payload.notificationId || "",
                        snId: payload.snId || "",
                        type: "sarah_network",
                    },
                    priority: "high",
                }),
            });
            if (res.ok) sent += 1;
        } catch {
            /* network failure — in-app delivery already succeeded */
        }
    }
    testLog.push({ ...record, sent });
    return { sent, attempted: tokens.length };
}

/**
 * After in-app fan-out, attempt device push for each notification (best effort).
 * @param {Array<{ uid: string, notificationId: string, title: string, body?: string, snId?: string }>} rows
 */
export async function pushForNotificationRows(rows) {
    let pushed = 0;
    for (const row of rows) {
        const r = await sendPushToUser(row.uid, row);
        if (r.sent > 0) pushed += 1;
    }
    return { pushed };
}
