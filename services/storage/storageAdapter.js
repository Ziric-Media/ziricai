import { memoryAdapter } from "./memoryAdapter.js";

let adapter = null;
let initPromise = null;

/**
 * Resolve storage backend from env:
 *   STORAGE_BACKEND=memory|firestore|auto
 * Unset in production defaults to memory (Railway-safe).
 * auto tries Firestore ping locally; on Railway or NOT_FOUND → memory.
 */
export function getConfiguredStorageBackend() {
    const raw = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
    if (raw) return raw;
    if (process.env.NODE_ENV === "production") return "memory";
    return "auto";
}

function isRailwayRuntime() {
    return Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID
    );
}

async function probeFirestore(firestoreAdapter) {
    const pingMs = Number(process.env.FIRESTORE_PING_TIMEOUT_MS) || 8000;
    await Promise.race([
        firestoreAdapter.ping(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Firestore ping timed out after ${pingMs}ms`)), pingMs)
        ),
    ]);
}

async function resolveAdapter() {
    const backend = getConfiguredStorageBackend();

    if (backend === "memory") {
        const reason = process.env.STORAGE_BACKEND
            ? "STORAGE_BACKEND=memory"
            : "production default (unset STORAGE_BACKEND)";
        console.error(`[storage] Using memory adapter (${reason})`);
        return memoryAdapter;
    }

    const { firestoreAdapter } = await import("./firestoreAdapter.js");

    if (backend === "firestore") {
        console.error("[storage] Using Firestore adapter (STORAGE_BACKEND=firestore)");
        return firestoreAdapter;
    }

    if (backend !== "auto") {
        console.error(`[storage] Unknown STORAGE_BACKEND="${backend}", using memory`);
        return memoryAdapter;
    }

    if (isRailwayRuntime()) {
        console.error(
            "[storage] Railway runtime: skipping Firestore auto-probe; using memory adapter. " +
            "Set STORAGE_BACKEND=firestore after creating a Firestore database in Firebase Console."
        );
        return memoryAdapter;
    }

    try {
        await probeFirestore(firestoreAdapter);
        console.error("[storage] Auto-selected Firestore adapter");
        return firestoreAdapter;
    } catch (err) {
        console.error(
            "[storage] Firestore unavailable, falling back to memory:",
            err.code ? `[${err.code}]` : "",
            err.message
        );
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

export { memoryAdapter };

/**
 * Resolve tenant-scoped storage mode for dual-write migration.
 * @returns {Promise<'memory'|'firestore'>}
 */
export async function getStorageBackendName() {
    const adapter = await getStorageAdapter();
    return adapter.name;
}
