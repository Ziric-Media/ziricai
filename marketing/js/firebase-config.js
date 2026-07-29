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
    };
}

/** @returns {import('firebase/app').FirebaseOptions} */
export function getFirebaseConfig() {
    if (typeof window !== "undefined" && window.__ZIRICAI_CONFIG__?.firebase) {
        return { ...PLACEHOLDER_CONFIG, ...window.__ZIRICAI_CONFIG__.firebase };
    }

    if (typeof process !== "undefined" && process.env) {
        const fromEnv = configFromEnv();
        if (fromEnv) return fromEnv;
    }

    return { ...PLACEHOLDER_CONFIG };
}

export function getFirebaseProjectId() {
    return getFirebaseConfig().projectId || "ziricai";
}
