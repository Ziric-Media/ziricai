/**
 * SN-03b — persist compiled edition fingerprints for slot dedupe (R2).
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import {
    personalSarahDocRef,
    getDoc,
    setDoc,
    serverTimestamp,
} from "../../database/firestoreClient.js";

const NEWS_EDITIONS_SUB = "newsEditions";

/** @type {Map<string, object>} */
const memoryEditions = new Map();

export function editionDocId(slot, dayKey) {
    return `${slot}_${dayKey}`;
}

export function localDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function memoryKey(uid, docId) {
    return `${uid}:${docId}`;
}

/**
 * @param {string} uid
 * @param {{ slot: string, compiledAt: string, stories: Array<{ storyId: string, headline: string, publishedAt?: number, link?: string }> }} payload
 */
export async function saveSarahNewsEditionSnapshot(uid, payload) {
    if (!uid || !payload?.slot) return null;
    const dayKey = localDayKey(new Date(payload.compiledAt || Date.now()));
    const docId = editionDocId(payload.slot, dayKey);
    const record = {
        slot: payload.slot,
        dayKey,
        compiledAt: payload.compiledAt,
        stories: (payload.stories || []).slice(0, 40),
        updatedAt: new Date().toISOString(),
    };
    if (getConfiguredStorageBackend() === "memory") {
        memoryEditions.set(memoryKey(uid, docId), record);
        return record;
    }
    await setDoc(
        personalSarahDocRef(uid, NEWS_EDITIONS_SUB, docId),
        { ...record, savedAt: serverTimestamp() },
        { merge: true }
    );
    return record;
}

/**
 * @param {string} uid
 * @param {"morning"|"lunch"|"evening"} slot
 * @param {string} [dayKey]
 */
export async function getSarahNewsEditionSnapshot(uid, slot, dayKey = localDayKey()) {
    if (!uid || !slot) return null;
    const docId = editionDocId(slot, dayKey);
    if (getConfiguredStorageBackend() === "memory") {
        return memoryEditions.get(memoryKey(uid, docId)) || null;
    }
    const snap = await getDoc(personalSarahDocRef(uid, NEWS_EDITIONS_SUB, docId));
    if (!snap.exists()) return null;
    return snap.data();
}

/** Prior slot in the same calendar day for dedupe windows. */
export function previousBriefingSlot(slot) {
    if (slot === "lunch") return "morning";
    if (slot === "evening") return "lunch";
    return null;
}

export function clearSarahNewsEditionStoreForTests() {
    memoryEditions.clear();
}