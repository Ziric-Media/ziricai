/**
 * Firebase web app configuration — single source for client + server bootstrap.
 *
 * Resolution order (browser):
 *   1. window.__ZIRICAI_CONFIG__.firebase  (injected by prepare-sites / Netlify build)
 *   2. Placeholders below (set FIREBASE_* env vars at build time for production)
 *
 * Resolution order (Node / Railway):
 *   process.env.FIREBASE_* variables
 */

const PLACEHOLDER_CONFIG = {
    apiKey: "your_firebase_web_api_key",
    authDomain: "ziricai.firebaseapp.com",
    projectId: "ziricai",
    storageBucket: "ziricai.firebasestorage.app",
    messagingSenderId: "your_messaging_sender_id",
    appId: "your_firebase_app_id",
    measurementId: "your_measurement_id",
};

/** Public Firebase web app config (ziricai). Used when build env omits FIREBASE_* vars. */
export const PRODUCTION_WEB_CONFIG = {
    apiKey: "AIzaSyDABe2SMR6x81KI7h_N44biSwLVxzx9yH8",
    authDomain: "ziricai.firebaseapp.com",
    projectId: "ziricai",
    storageBucket: "ziricai.firebasestorage.app",
    messagingSenderId: "482382497730",
    appId: "1:482382497730:web:6bc2f8668a1598fa13f85b",
    measurementId: "G-92ZVT0731S",
    databaseId: "default",
};

/** Reject dotenvx/async mistakes and placeholders — use plain Firebase Console strings. */
export function normalizeFirebaseEnvString(value) {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    if (!s) return undefined;
    if (s.startsWith("Promise") || s.includes("your_firebase")) return undefined;
    return s;
}

/** Merge injected/env overrides without letting empty strings wipe production keys. */
export function resolveWebFirebaseConfig(overrides = {}) {
    const merged = { ...PRODUCTION_WEB_CONFIG };
    for (const [key, value] of Object.entries(overrides)) {
        const normalized =
            typeof value === "string" || typeof value === "number" ? normalizeFirebaseEnvString(value) : value;
        if (normalized !== undefined && normalized !== null && normalized !== "") {
            merged[key] = normalized;
        }
    }
    return merged;
}

/** Web Firebase config from process.env (prepare-sites, local smoke, server verify). */
export function resolveWebFirebaseFromProcessEnv() {
    const projectId = normalizeFirebaseEnvString(process.env.FIREBASE_PROJECT_ID);
    const overrides = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
        databaseId: process.env.FIREBASE_DATABASE_ID,
    };

    if (!projectId) {
        return resolveWebFirebaseConfig(overrides);
    }

    // Non-production project — never bleed production web API key when staging env is partial/wrong.
    if (projectId !== "ziricai") {
        const merged = {
            ...PLACEHOLDER_CONFIG,
            projectId,
            authDomain: `${projectId}.firebaseapp.com`,
            storageBucket: `${projectId}.firebasestorage.app`,
            databaseId: "(default)",
        };
        for (const [key, value] of Object.entries(overrides)) {
            const normalized = normalizeFirebaseEnvString(value);
            if (normalized !== undefined) merged[key] = normalized;
        }
        return merged;
    }

    return resolveWebFirebaseConfig(overrides);
}

function configFromEnv() {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) return null;

    return {
        apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || PLACEHOLDER_CONFIG.apiKey,
        authDomain:
            process.env.FIREBASE_AUTH_DOMAIN ||
            process.env.VITE_FIREBASE_AUTH_DOMAIN ||
            `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket:
            process.env.FIREBASE_STORAGE_BUCKET ||
            process.env.VITE_FIREBASE_STORAGE_BUCKET ||
            `${projectId}.firebasestorage.app`,
        messagingSenderId:
            process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "",
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID || "",
        databaseId:
            process.env.FIREBASE_DATABASE_ID ||
            process.env.VITE_FIREBASE_DATABASE_ID ||
            (projectId === "ziricai" ? "default" : "(default)"),
    };
}

function shouldForceProductionPortalFirebase() {
    if (typeof window === "undefined" || typeof location === "undefined") return false;
    return /^app\.ziricai\.com$/i.test(location.hostname);
}

/** @returns {import('firebase/app').FirebaseOptions} */
export function getFirebaseConfig() {
    if (typeof window !== "undefined" && window.__ZIRICAI_CONFIG__?.firebase) {
        const cfg = resolveWebFirebaseConfig(window.__ZIRICAI_CONFIG__.firebase);
        if (shouldForceProductionPortalFirebase() && cfg.projectId !== "ziricai") {
            console.warn(
                "[firebase] app.ziricai.com must use Firebase project ziricai (build had",
                cfg.projectId,
                ") — using production web config"
            );
            return resolveWebFirebaseConfig({});
        }
        return cfg;
    }

    if (typeof process !== "undefined" && process.env) {
        const fromEnv = configFromEnv();
        if (fromEnv) return fromEnv;
    }

    if (typeof window !== "undefined") {
        return resolveWebFirebaseConfig({});
    }

    return { ...PLACEHOLDER_CONFIG };
}

export function getFirebaseProjectId() {
    return getFirebaseConfig().projectId || "ziricai";
}

/** Firestore database ID (ziricai project uses named database "default", not "(default)"). */
export function getFirebaseDatabaseId() {
    if (typeof window !== "undefined" && window.__ZIRICAI_CONFIG__?.firebase?.databaseId) {
        return window.__ZIRICAI_CONFIG__.firebase.databaseId;
    }

    if (typeof process !== "undefined" && process.env) {
        const fromEnv =
            process.env.FIREBASE_DATABASE_ID ||
            process.env.VITE_FIREBASE_DATABASE_ID ||
            null;
        if (fromEnv) return fromEnv;
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        if (projectId === "ziricai") return "default";
    }

    return getFirebaseProjectId() === "ziricai" ? "default" : "(default)";
}
