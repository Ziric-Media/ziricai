/**
 * SN-03b — index of users with an active Sarah News profile (scheduler fan-out).
 */
import { createNetworkCollection } from "../../network/networkCollectionStore.js";

const col = createNetworkCollection("sarahNewsSubscribers");

/**
 * @param {string} uid
 * @param {object|null} profile
 */
export async function syncSarahNewsSubscriber(uid, profile) {
    if (!uid) return;
    if (profile?.regions?.length) {
        await col.put(
            uid,
            {
                uid,
                breaking: Boolean(profile.breaking),
                briefings: { ...(profile.briefings || {}) },
                updatedAt: new Date().toISOString(),
            },
            { merge: false }
        );
        return;
    }
    try {
        await col.delete(uid);
    } catch {
        /* absent */
    }
}

/** @param {number} [limit] */
export async function listSarahNewsSubscriberUids(limit = 400) {
    const rows = await col.list({ limit: Math.min(limit, 800) });
    return rows.map((r) => r.uid).filter(Boolean);
}

export function clearSarahNewsSubscriberIndexForTests() {
    col.clearMemory();
}