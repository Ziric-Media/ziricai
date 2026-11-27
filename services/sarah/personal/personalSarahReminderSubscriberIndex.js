/**
 * ST-03c — index of users with active personal reminder tasks (scheduler fan-out).
 */
import { createNetworkCollection } from "../../network/networkCollectionStore.js";

const col = createNetworkCollection("personalSarahReminderSubscribers");

/** @param {string} uid */
export async function syncPersonalSarahReminderSubscriber(uid) {
    if (!uid) return;
    await col.put(
        uid,
        {
            uid,
            updatedAt: new Date().toISOString(),
        },
        { merge: false }
    );
}

/** @param {string} uid */
export async function removePersonalSarahReminderSubscriber(uid) {
    if (!uid) return;
    try {
        await col.delete(uid);
    } catch {
        /* absent */
    }
}

/** @param {number} [limit] */
export async function listPersonalSarahReminderSubscriberUids(limit = 400) {
    const rows = await col.list({ limit: Math.min(limit, 800) });
    return rows.map((r) => r.uid).filter(Boolean);
}

export function clearPersonalSarahReminderSubscriberIndexForTests() {
    col.clearMemory();
}