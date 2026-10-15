import { memoryAdapter } from "./memoryAdapter.js";
import { hasAdminCredentials, getAdminInitError, getAdminFirestore } from "../database/firestoreAdmin.js";

let adapter = null;
let initPromise = null;
let fallbackReason = null;

/**
 * Resolve storage backend from env:
 *   STORAGE_BACKEND=memory|firestore|auto
 * Unset in production defaults to memory (Railway-safe).
 * auto tries Firestore ping locally; on Railway or NOT_FOUND → memory.
 * firestore on Railway requires Admin SDK credentials; falls back to memory if missing.
 */
export function getConfiguredStorageBackend() {
    const raw = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
    if (raw) return raw;
    if (process.env.NODE_ENV === "production") {
        if (hasAdminCredentials()) return "firestore";
        return "memory";
    }
    return "auto";
}

export function getStorageFallbackReason() {
    return fallbackReason;
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
    const maxAttemptsRaw = parseInt(process.env.FIRESTORE_PROBE_ATTEMPTS || "2", 10);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw >= 1 ? Math.min(maxAttemptsRaw, 3) : 2;

    if (hasAdminCredentials()) {
        getAdminFirestore();
    }

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await Promise.race([
                firestoreAdapter.ping(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Firestore ping timed out after ${pingMs}ms`)), pingMs)
                ),
            ]);
            return;
        } catch (err) {
            lastErr = err;
            const retryable = /timed out/i.test(err?.message || "");
            if (!retryable || attempt >= maxAttempts) {
                throw err;
            }
            console.error(
                `[storage] Firestore probe attempt ${attempt}/${maxAttempts} failed (${err.message}); retrying…`
            );
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    }
    throw lastErr;
}

async function resolveAdapter() {
    const backend = getConfiguredStorageBackend();

    if (backend === "memory") {
        const reason = process.env.STORAGE_BACKEND
            ? "STORAGE_BACKEND=memory"
            : "production default (unset STORAGE_BACKEND)";
        fallbackReason = reason;
        console.error(`[storage] Using memory adapter (${reason})`);
        return memoryAdapter;
    }

    const { firestoreAdapter } = await import("./firestoreAdapter.js");

    if (backend === "firestore") {
        if (isRailwayRuntime() && !hasAdminCredentials()) {
            fallbackReason =
                "STORAGE_BACKEND=firestore but Firebase Admin credentials missing " +
                "(set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS_JSON)";
            console.error(`[storage] ${fallbackReason} — falling back to memory`);
            return memoryAdapter;
        }

        try {
            await probeFirestore(firestoreAdapter);
            console.error("[storage] Using Firestore adapter (STORAGE_BACKEND=firestore)");
            return firestoreAdapter;
        } catch (err) {
            fallbackReason = `Firestore probe failed: ${err.message}`;
            console.error(`[storage] ${fallbackReason} — falling back to memory`);
            return memoryAdapter;
        }
    }

    if (backend !== "auto") {
        fallbackReason = `Unknown STORAGE_BACKEND="${backend}"`;
        console.error(`[storage] ${fallbackReason}, using memory`);
        return memoryAdapter;
    }

    if (isRailwayRuntime()) {
        if (hasAdminCredentials()) {
            try {
                await probeFirestore(firestoreAdapter);
                console.error("[storage] Railway auto-selected Firestore adapter (Admin credentials present)");
                return firestoreAdapter;
            } catch (err) {
                fallbackReason = `Railway Firestore probe failed: ${err.message}`;
                console.error(`[storage] ${fallbackReason} — falling back to memory`);
                return memoryAdapter;
            }
        }
        fallbackReason =
            "Railway runtime — set STORAGE_BACKEND=firestore and Firebase Admin credentials for durable tenant data";
        console.error(`[storage] ${fallbackReason}. Using memory adapter.`);
        return memoryAdapter;
    }

    try {
        await probeFirestore(firestoreAdapter);
        console.error("[storage] Auto-selected Firestore adapter");
        return firestoreAdapter;
    } catch (err) {
        fallbackReason = `Firestore unavailable: ${err.message}`;
        console.error("[storage] Firestore unavailable, falling back to memory:", err.code ? `[${err.code}]` : "", err.message);
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

export { hasAdminCredentials, getAdminInitError };
