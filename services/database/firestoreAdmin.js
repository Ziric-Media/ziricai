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
import { getFirebaseProjectId } from "../../js/firebase-config.js";

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

/** True when Railway/server has credentials to use Admin SDK. */
export function hasAdminCredentials() {
    if (parseServiceAccountJson()) return true;
    if (buildCertFromEnv()?.clientEmail && buildCertFromEnv()?.privateKey) return true;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
    return false;
}

/** Initialize Admin SDK once; returns Firestore instance or null. */
export function getAdminFirestore() {
    if (adminDb) return adminDb;
    if (initAttempted) return null;
    initAttempted = true;

    try {
        if (admin.apps.length === 0) {
            const jsonCreds = parseServiceAccountJson();
            const envCreds = buildCertFromEnv();

            if (jsonCreds) {
                admin.initializeApp({
                    credential: admin.credential.cert(jsonCreds),
                    projectId: jsonCreds.project_id || getFirebaseProjectId(),
                });
            } else if (envCreds?.clientEmail && envCreds?.privateKey) {
                admin.initializeApp({
                    credential: admin.credential.cert(envCreds),
                    projectId: envCreds.projectId,
                });
            } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                admin.initializeApp({
                    credential: admin.credential.applicationDefault(),
                    projectId: process.env.FIREBASE_PROJECT_ID || getFirebaseProjectId(),
                });
            } else {
                return null;
            }
        }

        adminDb = admin.firestore();
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
    return admin.firestore.FieldValue.serverTimestamp();
}
