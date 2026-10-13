/**
 * Firebase Admin SDK — server-side Firestore (Railway API).
 * Bypasses security rules for trusted backend writes.
 *
 * Credentials (any one of):
 *   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON  (full service account JSON string)
 *   GOOGLE_APPLICATION_CREDENTIALS       (path to JSON file — local dev)
 */
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getFirebaseProjectId, getFirebaseDatabaseId } from "../../js/firebase-config.js";

let adminDb = null;
let initAttempted = false;
let initError = null;

function parseServiceAccountJson() {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (err) {
        initError = `GOOGLE_APPLICATION_CREDENTIALS_JSON parse error: ${err.message}`;
        return null;
    }
}

function buildCertFromEnv() {
    const projectId = process.env.FIREBASE_PROJECT_ID || getFirebaseProjectId();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) return null;

    return {
        projectId,
        clientEmail,
        privateKey,
    };
}

function initializeAdminApp() {
    if (admin.apps.length > 0) return admin.app();

    /** Local Firestore emulator — no service account required (FIRESTORE_EMULATOR_HOST must be set before first getAdminFirestore()). */
    if (process.env.FIRESTORE_EMULATOR_HOST) {
        const projectId =
            process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || getFirebaseProjectId() || "ziricai-local-emulator";
        return admin.initializeApp({ projectId });
    }

    const jsonCreds = parseServiceAccountJson();
    const envCreds = buildCertFromEnv();

    // Prefer split env vars on Railway — multiline GOOGLE_APPLICATION_CREDENTIALS_JSON
    // can break inside containers while FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY stay intact.
    if (envCreds?.clientEmail && envCreds?.privateKey) {
        return admin.initializeApp({
            credential: admin.credential.cert(envCreds),
            projectId: envCreds.projectId,
        });
    }

    if (jsonCreds) {
        return admin.initializeApp({
            credential: admin.credential.cert(jsonCreds),
            projectId: jsonCreds.project_id || getFirebaseProjectId(),
        });
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: process.env.FIREBASE_PROJECT_ID || getFirebaseProjectId(),
        });
    }

    return null;
}

/** True when Railway/server has credentials to use Admin SDK. */
export function hasAdminCredentials() {
    if (process.env.FIRESTORE_EMULATOR_HOST) return true;
    if (parseServiceAccountJson()) return true;
    if (buildCertFromEnv()?.clientEmail && buildCertFromEnv()?.privateKey) return true;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
    return false;
}

/** Named Firestore database ID (ziricai uses "default", not "(default)"). */
export function getAdminDatabaseId() {
    return getFirebaseDatabaseId();
}

/** Initialize Admin SDK once; returns Firestore instance or null. */
export function getAdminFirestore() {
    if (adminDb) return adminDb;
    if (initAttempted) return null;
    initAttempted = true;

    try {
        const app = initializeAdminApp();
        if (!app) {
            const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "";
            console.error("[firestoreAdmin] No Admin app — credential diagnostics:", {
                jsonLen: raw.length,
                jsonParseOk: (() => {
                    try {
                        if (!raw) return false;
                        JSON.parse(raw);
                        return true;
                    } catch {
                        return false;
                    }
                })(),
                hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
                hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
                databaseId: getAdminDatabaseId(),
                initError: initError || null,
            });
            return null;
        }

        const databaseId = getAdminDatabaseId();
        adminDb = getFirestore(app, databaseId);
        try {
            adminDb.settings({ ignoreUndefinedProperties: true });
        } catch {
            /* settings already applied on this instance */
        }
        console.error(`[firestoreAdmin] Using Firestore database "${databaseId}"`);
        return adminDb;
    } catch (err) {
        initError = err.message;
        console.error("[firestoreAdmin] Init failed:", err.message);
        return null;
    }
}

export function getAdminInitError() {
    return initError;
}

export function isServerSide() {
    return typeof window === "undefined";
}

/** Admin FieldValue.serverTimestamp() */
export function adminServerTimestamp() {
    return FieldValue.serverTimestamp();
}
