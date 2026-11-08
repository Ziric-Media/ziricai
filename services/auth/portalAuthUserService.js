/**
 * Create or resolve Firebase Auth users for portal team members (owner-provisioned logins).
 */
import admin from "firebase-admin";
import { hasAdminCredentials, getAdminFirestore } from "../database/firestoreAdmin.js";

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 6) {
        throw Object.assign(new Error("Password must be at least 6 characters"), {
            status: 400,
            code: "WEAK_PASSWORD",
        });
    }
    return value;
}

/**
 * @param {{ email: string, password: string, fullName?: string }} input
 * @returns {Promise<{ uid: string, created: boolean, email: string }>}
 */
export async function createPortalAuthUser({ email, password, fullName = "Team member" } = {}) {
    if (!hasAdminCredentials()) {
        throw Object.assign(new Error("Firebase Admin credentials are required to create portal logins"), {
            status: 503,
            code: "NO_ADMIN_CREDENTIALS",
        });
    }
    getAdminFirestore();
    if (!admin.apps.length) {
        throw Object.assign(new Error("Firebase Admin app unavailable"), {
            status: 503,
            code: "ADMIN_APP_UNAVAILABLE",
        });
    }

    const normalized = normalizeEmail(email);
    if (!validateEmail(normalized)) {
        throw Object.assign(new Error("Valid member email is required"), {
            status: 400,
            code: "INVALID_EMAIL",
        });
    }
    const secret = validatePassword(password);
    const displayName = String(fullName || "Team member").trim() || "Team member";

    try {
        const existing = await admin.auth().getUserByEmail(normalized);
        throw Object.assign(
            new Error(
                "An account with this email already exists. Remove it from Auth or use a different email for a new login."
            ),
            { status: 409, code: "AUTH_EMAIL_EXISTS", uid: existing.uid }
        );
    } catch (err) {
        if (err?.code !== "auth/user-not-found" && err?.status !== 409) throw err;
        if (err?.status === 409) throw err;
    }

    const created = await admin.auth().createUser({
        email: normalized,
        password: secret,
        displayName,
        emailVerified: false,
    });

    return { uid: created.uid, created: true, email: normalized };
}
