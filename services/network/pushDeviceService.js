/**
 * Phase 2.1 — FCM device tokens for Sarah Network subscriber push (web push MVP).
 * One row per (uid, token); consent must be true to receive pushes.
 */
import { createHash } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.PUSH_DEVICES);
const MAX_TOKENS_PER_USER = 8;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function deviceDocId(uid, token) {
    return `pdt_${createHash("sha256").update(`${uid}|${token}`).digest("hex").slice(0, 24)}`;
}

/**
 * @param {string} uid
 * @param {{ token: string, platform?: string, consent?: boolean }} input
 */
export async function registerPushDevice(uid, input = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const token = String(input.token || "").trim();
    if (token.length < 20 || token.length > 4096) throw err(422, "PUSH_TOKEN_INVALID", "A valid FCM device token is required.");
    const consent = input.consent !== false;
    const platform = String(input.platform || "web").slice(0, 32);
    const id = deviceDocId(uid, token);
    const now = new Date().toISOString();
    await col.put(
        id,
        {
            deviceId: id,
            uid,
            token,
            platform,
            consent,
            registeredAt: now,
            updatedAt: now,
            schemaVersion: 1,
        },
        { merge: false }
    );
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: 50 })).map(({ __id, ...r }) => r);
    if (rows.length > MAX_TOKENS_PER_USER) {
        const drop = rows.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).slice(0, rows.length - MAX_TOKENS_PER_USER);
        for (const d of drop) await col.delete(deviceDocId(uid, d.token));
    }
    return { deviceId: id, consent, platform };
}

/** @param {string} uid */
export async function listConsentedPushTokens(uid) {
    if (!uid) return [];
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: 20 })).map(({ __id, ...r }) => r);
    return rows.filter((r) => r.consent !== false).map((r) => r.token);
}

export function clearPushDevicesForTests() {
    col.clearMemory();
}
