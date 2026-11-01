/**
 * Shared registry doc read/write for pool + G5 assignment service.
 */
import { getAdminFirestore, hasAdminCredentials } from "../database/firestoreAdmin.js";
import { platformWhatsAppNumberPath } from "../database/schema.js";
import { normalizeRegistryRecord } from "./whatsappGatewayRegistry.js";

/** @type {Map<string, object>} */
const memoryPool = new Map();

function useFirestore() {
    return hasAdminCredentials() && Boolean(getAdminFirestore());
}

function nowIso() {
    return new Date().toISOString();
}

export async function readPoolRegistryDoc(numberId) {
    let raw = null;
    if (!useFirestore()) {
        raw = memoryPool.get(String(numberId)) || null;
    } else {
        const snap = await getAdminFirestore().doc(platformWhatsAppNumberPath(numberId)).get();
        if (!snap.exists) return null;
        raw = { id: snap.id, ...snap.data() };
    }
    return raw ? normalizeRegistryRecord(raw) : null;
}

export async function writePoolRegistryDoc(numberId, data, { merge = true } = {}) {
    const id = String(numberId);
    const payload = { ...data, id, updatedAt: nowIso() };
    if (!useFirestore()) {
        const prev = memoryPool.get(id) || {};
        const next = merge ? { ...prev, ...payload } : payload;
        memoryPool.set(id, next);
        return normalizeRegistryRecord(next);
    }
    const ref = getAdminFirestore().doc(platformWhatsAppNumberPath(id));
    if (merge) {
        await ref.set(payload, { merge: true });
    } else {
        await ref.set(payload);
    }
    const snap = await ref.get();
    return normalizeRegistryRecord({ id: snap.id, ...snap.data() });
}

/** Test-only */
export function __resetMemoryPoolForTests() {
    memoryPool.clear();
}

export function __memoryPoolForTests() {
    return memoryPool;
}
