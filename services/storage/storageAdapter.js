import { firestoreAdapter } from "./firestoreAdapter.js";
import { memoryAdapter } from "./memoryAdapter.js";

let adapter = null;
let initPromise = null;

/**
 * Resolve storage backend from env:
 *   STORAGE_BACKEND=memory|firestore|auto (default: auto)
 * auto tries Firestore ping, falls back to in-memory on failure.
 */
async function resolveAdapter() {
    const backend = (process.env.STORAGE_BACKEND || "auto").toLowerCase();

    if (backend === "memory") {
        console.log("[storage] Using memory adapter (STORAGE_BACKEND=memory)");
        return memoryAdapter;
    }

    if (backend === "firestore") {
        console.log("[storage] Using Firestore adapter (STORAGE_BACKEND=firestore)");
        return firestoreAdapter;
    }

    try {
        const pingMs = Number(process.env.FIRESTORE_PING_TIMEOUT_MS) || 8000;
        await Promise.race([
            firestoreAdapter.ping(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Firestore ping timed out after ${pingMs}ms`)), pingMs)
            ),
        ]);
        console.log("[storage] Auto-selected Firestore adapter");
        return firestoreAdapter;
    } catch (err) {
        console.warn("[storage] Firestore unavailable, falling back to memory:", err.message);
        return memoryAdapter;
    }
}

export async function getStorageAdapter() {
    if (adapter) return adapter;
    if (!initPromise) initPromise = resolveAdapter();
    adapter = await initPromise;
    return adapter;
}

/** Synchronous accessor — only valid after getStorageAdapter() has resolved once. */
export function storageAdapter() {
    if (!adapter) {
        throw new Error("Storage adapter not initialized — call getStorageAdapter() first");
    }
    return adapter;
}

export { firestoreAdapter, memoryAdapter };

/**
 * Resolve tenant-scoped storage mode for dual-write migration.
 * @returns {Promise<'memory'|'firestore'>}
 */
export async function getStorageBackendName() {
    const adapter = await getStorageAdapter();
    return adapter.name;
}
