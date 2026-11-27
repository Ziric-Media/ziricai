/**
 * Touch consumer lastActiveAt (throttled) for Mission Control / compliance.
 */
import { getConfiguredStorageBackend } from "../storage/storageAdapter.js";
import { setDoc, userProfileRef, serverTimestamp } from "../database/firestoreClient.js";

const memoryLastActive = new Map();
/** @type {Map<string, number>} */
const touchThrottle = new Map();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * @param {string} uid
 * @param {{ force?: boolean }} [opts]
 */
export async function touchConsumerLastActive(uid, opts = {}) {
    if (!uid) return;
    const now = Date.now();
    if (!opts.force) {
        const last = touchThrottle.get(uid) || 0;
        if (now - last < TOUCH_INTERVAL_MS) return;
    }
    touchThrottle.set(uid, now);
    memoryLastActive.set(uid, new Date().toISOString());

    if (getConfiguredStorageBackend() === "memory") return;

    try {
        await setDoc(
            userProfileRef(uid),
            {
                lastActiveAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    } catch (err) {
        console.warn("[consumerLastActive]", err.message);
    }
}