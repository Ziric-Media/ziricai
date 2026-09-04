/**
 * Server-side auth helpers — wraps existing Firebase auth patterns.
 * Client auth remains in js/auth.js; this module supports API tenant scoping.
 */
import { getDoc } from "firebase/firestore";
import admin from "firebase-admin";
import { app } from "../../js/firebase.js";
import { getFirebaseProjectId, getFirebaseDatabaseId } from "../../js/firebase-config.js";
import { globalUserRef, tenantDocRef } from "../database/firestoreClient.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { upsertTenantUser } from "../tenants/userService.js";
import { getAdminFirestore, hasAdminCredentials } from "../database/firestoreAdmin.js";

const SUPERADMIN_ROLES = new Set(["superadmin", "super admin", "super-admin", "super_admin"]);
const PLACEHOLDER_API_KEY = "your_firebase_web_api_key";

export function normalizeRole(role) {
    return String(role || "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

export function isSuperAdminRole(role) {
    return SUPERADMIN_ROLES.has(String(role || "").toLowerCase().trim()) || normalizeRole(role) === "superadmin";
}

function parseRestFirestoreValue(value) {
    if (!value || typeof value !== "object") return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("booleanValue" in value) return value.booleanValue;
    if ("nullValue" in value) return null;
    if ("timestampValue" in value) return value.timestampValue;
    return null;
}

function restFieldsToObject(fields) {
    const out = {};
    for (const [key, val] of Object.entries(fields || {})) {
        out[key] = parseRestFirestoreValue(val);
    }
    return out;
}

/**
 * Load users/{uid} using the caller's Firebase ID token (Firestore REST).
 * Used on Railway when Admin SDK is unavailable — rules allow self-read.
 */
export async function getUserProfileViaIdToken(uid, idToken) {
    if (!uid || !idToken) return null;

    const projectId = process.env.FIREBASE_PROJECT_ID || getFirebaseProjectId();
    const databaseId = getFirebaseDatabaseId();
    const url =
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
        `/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}`;

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${idToken}` },
        });

        if (res.status === 404) return null;
        if (!res.ok) {
            console.warn("[authService] getUserProfileViaIdToken failed:", res.status);
            return null;
        }

        const docJson = await res.json();
        const data = restFieldsToObject(docJson.fields);
        return {
            uid,
            ...data,
            companyId: data.companyId || data.company || null,
        };
    } catch (err) {
        console.warn("[authService] getUserProfileViaIdToken error:", err.message);
        return null;
    }
}

/**
 * Whether Railway can verify Firebase ID tokens (Admin SDK or Identity Toolkit REST).
 */
export function isFirebaseTokenVerificationReady() {
    if (hasAdminCredentials()) return true;
    const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || app.options?.apiKey;
    return Boolean(apiKey && apiKey !== PLACEHOLDER_API_KEY);
}

/**
 * Verify token via Firebase Admin SDK when service-account credentials are configured.
 * @param {string} idToken
 */
async function verifyIdTokenViaAdmin(idToken) {
    if (!hasAdminCredentials()) return null;

    try {
        getAdminFirestore();
        if (admin.apps.length === 0) return null;

        const decoded = await admin.auth().verifyIdToken(idToken);
        return {
            uid: decoded.uid,
            email: decoded.email || null,
        };
    } catch (err) {
        console.warn("[authService] verifyIdTokenViaAdmin failed:", err.code || err.message);
        return null;
    }
}

/**
 * Verify Firebase ID token via Identity Toolkit REST API (no firebase-admin required).
 * @param {string} idToken
 * @returns {Promise<{ uid: string, email: string|null }|null>}
 */
export async function verifyIdToken(idToken) {
    if (!idToken) return null;

    const viaAdmin = await verifyIdTokenViaAdmin(idToken);
    if (viaAdmin) return viaAdmin;

    const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || app.options?.apiKey;
    if (!apiKey || apiKey === PLACEHOLDER_API_KEY) {
        console.warn("[authService] verifyIdToken: FIREBASE_API_KEY not configured on server");
        return null;
    }

    try {
        const res = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            }
        );

        if (!res.ok) {
            console.warn("[authService] verifyIdToken REST lookup failed:", res.status);
            return null;
        }
        const data = await res.json();
        const user = data.users?.[0];
        if (!user) return null;

        return {
            uid: user.localId,
            email: user.email || null,
        };
    } catch (err) {
        console.warn("[authService] verifyIdToken failed:", err.message);
        return null;
    }
}

/**
 * Load global user profile from users/{uid}.
 * @param {string} uid
 */
export async function getUserProfile(uid) {
    if (!uid) return null;
    try {
        const snap = await getDoc(globalUserRef(uid));
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
            uid,
            ...data,
            companyId: data.companyId || data.company || null,
        };
    } catch (err) {
        console.warn("[authService] getUserProfile failed:", err.message);
        return null;
    }
}

/**
 * Load tenant membership doc companies/{companyId}/users/{uid}.
 * @param {string} uid
 * @param {string} companyId
 */
export async function getTenantMembership(uid, companyId) {
    if (!uid || !companyId) return null;
    try {
        const snap = await getDoc(tenantDocRef(companyId, TENANT_COLLECTIONS.USERS, uid));
        if (!snap.exists()) return null;
        return { uid, companyId, ...snap.data() };
    } catch (err) {
        console.warn("[authService] getTenantMembership failed:", err.message);
        return null;
    }
}

/**
 * Resolve auth context from Express request Authorization header.
 * @param {import('express').Request} req
 */
export async function resolveAuthFromRequest(req) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const hasBearerToken = Boolean(token);

    if (!token) {
        return {
            uid: null,
            email: null,
            role: null,
            isSuperAdmin: false,
            profile: null,
            hasBearerToken: false,
            tokenVerified: false,
        };
    }

    const verified = await verifyIdToken(token);
    if (!verified) {
        return {
            uid: null,
            email: null,
            role: null,
            isSuperAdmin: false,
            profile: null,
            hasBearerToken: true,
            tokenVerified: false,
        };
    }

    let profile = await getUserProfile(verified.uid);
    if (!profile) {
        profile = await getUserProfileViaIdToken(verified.uid, token);
    }

    const role = profile?.role || null;

    return {
        uid: verified.uid,
        email: verified.email || profile?.email || null,
        role,
        isSuperAdmin: isSuperAdminRole(role),
        profile,
        hasBearerToken: true,
        tokenVerified: true,
    };
}

/**
 * Check if user belongs to company (strict mode helper).
 * @param {object} profile
 * @param {string} companyId
 */
export function userBelongsToCompany(profile, companyId) {
    if (!profile || !companyId) return false;
    if (isSuperAdminRole(profile.role)) return true;
    const profileCompany = profile.companyId || profile.company;
    return profileCompany === companyId;
}

/**
 * Optional MFA enforcement for strict routes.
 * Set MFA_ENFORCEMENT=strict to require mfaEnabled on profile.
 * @param {object|null} profile
 */
export function assertMfaIfRequired(profile) {
    const mfaMode = (process.env.MFA_ENFORCEMENT || "off").toLowerCase();
    if (mfaMode !== "strict") return;
    if (!profile?.mfaEnabled) {
        throw Object.assign(new Error("Multi-factor authentication required"), {
            status: 403,
            code: "MFA_REQUIRED",
        });
    }
}

/**
 * Create or update owner membership during onboarding (server-side).
 * @param {string} uid
 * @param {string} companyId
 * @param {object} data
 */
export async function upsertOwnerMembership(uid, companyId, data = {}) {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        return upsertTenantUser(companyId, uid, {
            email: data.email || null,
            fullName: data.fullName || data.name || null,
            role: data.role || "owner",
            status: data.status || "active",
        });
    }

    const { setDoc, serverTimestamp } = await import("../database/firestoreClient.js");
    const membershipRef = tenantDocRef(companyId, TENANT_COLLECTIONS.USERS, uid);
    await setDoc(
        membershipRef,
        {
            uid,
            companyId,
            email: data.email || null,
            fullName: data.fullName || data.name || null,
            role: data.role || "owner",
            status: data.status || "active",
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Update global user profile with companyId (server-side onboarding).
 */
export async function upsertGlobalUserProfile(uid, data = {}) {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        return { uid, ...data, backend: "memory" };
    }

    const { setDoc, serverTimestamp } = await import("../database/firestoreClient.js");
    await setDoc(
        globalUserRef(uid),
        {
            uid,
            email: data.email || null,
            fullName: data.fullName || data.name || null,
            role: data.role || "owner",
            companyId: data.companyId || null,
            company: data.companyId || data.company || null,
            status: data.status || "active",
            mfaEnabled: Boolean(data.mfaEnabled),
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}
