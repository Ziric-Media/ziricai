/**
 * Cross-site Firebase session handoff (marketing → app/admin subdomains).
 * Requires Firebase Admin credentials on the API host.
 */
import admin from "firebase-admin";
import { getAdminFirestore } from "../database/firestoreAdmin.js";

/**
 * @param {string} uid Firebase Auth uid (must match verified ID token)
 * @returns {Promise<string>} Firebase custom token (single use on client)
 */
export async function createAuthHandoffToken(uid) {
    if (!uid || typeof uid !== "string") {
        throw new Error("uid required");
    }
    getAdminFirestore();
    if (!admin.apps.length) {
        const err = new Error("Auth handoff unavailable — server credentials not configured");
        err.code = "HANDOFF_UNAVAILABLE";
        throw err;
    }
    return admin.auth().createCustomToken(uid);
}
