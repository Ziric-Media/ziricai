/**
 * Phase 2.1/2.2 — deliver subscriber notifications to FCM when configured.
 * Prefer **FCM HTTP v1** via Railway Firebase Admin vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * Legacy fallback: FCM_SERVER_KEY → https://fcm.googleapis.com/fcm/send
 * Client: Sarah App registers a real FCM token when `firebase.vapidKey` is present in site config;
 * otherwise a stable `web_*` token is used. Without credentials the send is a no-op (in-app poll unchanged).
 */
import { createSign } from "node:crypto";
import { listConsentedPushTokens } from "./pushDeviceService.js";

/** @type {Array<{ uid: string, title: string, body: string, at: string, sent?: number }>} */
const testLog = [];

/** @type {typeof fetch | null} */
let fetchImpl = typeof fetch === "function" ? fetch : null;

/** @type {string | null | undefined} */
let accessTokenOverride;

let cachedAccessToken = "";
let cachedAccessTokenExpMs = 0;

export function drainPushAttemptsForTests() {
    return testLog.splice(0, testLog.length);
}

/** @param {typeof fetch} fn */
export function setFcmFetchForTests(fn) {
    fetchImpl = fn;
}

/** @param {string | null} token Fixed bearer for v1 sends; `null` clears override */
export function setFcmAccessTokenForTests(token) {
    accessTokenOverride = token;
}

export function resetFcmForTests() {
    fetchImpl = typeof fetch === "function" ? fetch : null;
    accessTokenOverride = undefined;
    cachedAccessToken = "";
    cachedAccessTokenExpMs = 0;
}

function httpFetch(url, init) {
    const fn = fetchImpl || fetch;
    return fn(url, init);
}

function fcmLegacyKey() {
    return String(process.env.FCM_SERVER_KEY || "").trim();
}

/** @returns {{ projectId: string, clientEmail: string, privateKey: string } | null} */
function fcmV1Credentials() {
    const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
}

function fcmMode() {
    if (fcmV1Credentials()) return "v1";
    if (fcmLegacyKey()) return "legacy";
    return null;
}

function base64urlJson(obj) {
    return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/**
 * @param {{ clientEmail: string, privateKey: string }} creds
 * @returns {string}
 */
function signServiceAccountJwt(creds) {
    const iat = Math.floor(Date.now() / 1000);
    const payload = {
        iss: creds.clientEmail,
        sub: creds.clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp: iat + 3600,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
    };
    const header = { alg: "RS256", typ: "JWT" };
    const unsigned = `${base64urlJson(header)}.${base64urlJson(payload)}`;
    const sign = createSign("RSA-SHA256");
    sign.update(unsigned);
    sign.end();
    return `${unsigned}.${sign.sign(creds.privateKey, "base64url")}`;
}

/**
 * @param {{ clientEmail: string, privateKey: string }} creds
 */
async function getFcmV1AccessToken(creds) {
    if (accessTokenOverride !== undefined) return accessTokenOverride;
    const now = Date.now();
    if (cachedAccessToken && now < cachedAccessTokenExpMs - 60_000) return cachedAccessToken;

    const assertion = signServiceAccountJwt(creds);
    const res = await httpFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const token = String(body.access_token || "");
    if (!token) return null;
    cachedAccessToken = token;
    const expiresIn = Number(body.expires_in) || 3600;
    cachedAccessTokenExpMs = now + expiresIn * 1000;
    return token;
}

/**
 * @param {string} token
 * @param {{ title: string, body?: string, notificationId?: string, snId?: string }} payload
 */
async function sendFcmLegacy(token, payload) {
    const key = fcmLegacyKey();
    const res = await httpFetch("https://fcm.googleapis.com/fcm/send", {
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
    return res.ok;
}

/**
 * @param {string} deviceToken
 * @param {{ title: string, body?: string, notificationId?: string, snId?: string }} payload
 */
async function sendFcmV1(deviceToken, payload) {
    const creds = fcmV1Credentials();
    if (!creds) return false;
    const accessToken = await getFcmV1AccessToken(creds);
    if (!accessToken) return false;

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(creds.projectId)}/messages:send`;
    const res = await httpFetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            message: {
                token: deviceToken,
                notification: { title: payload.title, body: payload.body || "" },
                data: {
                    notificationId: String(payload.notificationId || ""),
                    snId: String(payload.snId || ""),
                    type: "sarah_network",
                },
            },
        }),
    });
    return res.ok;
}

/**
 * @param {string} uid
 * @param {{ title: string, body?: string, notificationId?: string, snId?: string }} payload
 */
export async function sendPushToUser(uid, payload) {
    const tokens = await listConsentedPushTokens(uid);
    if (!tokens.length) return { sent: 0, skipped: "no_devices" };
    const mode = fcmMode();
    const record = { uid, title: payload.title, body: payload.body || "", at: new Date().toISOString() };
    if (!mode) {
        testLog.push(record);
        return { sent: 0, skipped: "fcm_not_configured", wouldSend: tokens.length };
    }
    let sent = 0;
    for (const token of tokens) {
        try {
            const ok =
                mode === "v1" ? await sendFcmV1(token, payload) : await sendFcmLegacy(token, payload);
            if (ok) sent += 1;
        } catch {
            /* network failure — in-app delivery already succeeded */
        }
    }
    testLog.push({ ...record, sent });
    return { sent, attempted: tokens.length, mode };
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
