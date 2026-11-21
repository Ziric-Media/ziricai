/**
 * SN-03b — idempotent briefing/breaking delivery markers.
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import {
    personalSarahDocRef,
    getDoc,
    setDoc,
    serverTimestamp,
} from "../../database/firestoreClient.js";

const SUB = "newsDeliveries";
/** @type {Map<string, object>} */
const memory = new Map();

function memKey(uid, id) {
    return `${uid}:${id}`;
}

/**
 * @param {string} uid
 * @param {string} deliveryId e.g. briefing_morning_2026-11-21
 */
export async function wasSarahNewsDeliverySent(uid, deliveryId) {
    if (!uid || !deliveryId) return false;
    if (getConfiguredStorageBackend() === "memory") {
        return Boolean(memory.get(memKey(uid, deliveryId)));
    }
    const snap = await getDoc(personalSarahDocRef(uid, SUB, deliveryId));
    return snap.exists();
}

/**
 * @param {string} uid
 * @param {string} deliveryId
 * @param {object} meta
 */
export async function markSarahNewsDeliverySent(uid, deliveryId, meta = {}) {
    if (!uid || !deliveryId) return;
    const record = { deliveryId, sentAt: new Date().toISOString(), ...meta };
    if (getConfiguredStorageBackend() === "memory") {
        memory.set(memKey(uid, deliveryId), record);
        return;
    }
    await setDoc(personalSarahDocRef(uid, SUB, deliveryId), { ...record, savedAt: serverTimestamp() }, { merge: true });
}

export function briefingDeliveryId(slot, dayKey) {
    return `briefing_${slot}_${dayKey}`;
}

export function breakingDeliveryId(storyId, dayKey) {
    return `breaking_${storyId}_${dayKey}`;
}

export function clearSarahNewsDeliveryStoreForTests() {
    memory.clear();
}