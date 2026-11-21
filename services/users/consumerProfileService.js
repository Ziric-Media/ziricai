/**
 * Sarah App (U1) — consumer profile at userProfiles/{uid}.
 */
import { getConfiguredStorageBackend } from "../storage/storageAdapter.js";
import { getUserProfile } from "../auth/authService.js";
import {
    getDoc,
    setDoc,
    globalUserRef,
    userProfileRef,
    userPreferencesRef,
    serverTimestamp,
} from "../database/firestoreClient.js";
import { ROOT } from "../database/schema.js";

const memoryConsumerProfiles = new Map();
const memoryConsumerPreferences = new Map();

export const CONSUMER_ACCOUNT_KIND = "consumer";

function normalizeKinds(profile) {
    const raw = profile?.accountKinds;
    if (Array.isArray(raw)) return raw.map(String);
    return [];
}

/**
 * Consumer access requires a userProfiles doc — accountKinds alone is never sufficient.
 * @param {string} uid
 */
export async function getConsumerProfile(uid) {
    if (!uid) return null;
    if (getConfiguredStorageBackend() === "memory") {
        return memoryConsumerProfiles.get(uid) || null;
    }
    const snap = await getDoc(userProfileRef(uid));
    if (!snap.exists()) return null;
    return { uid, ...snap.data() };
}

export async function getConsumerPreferences(uid) {
    if (!uid) return null;
    if (getConfiguredStorageBackend() === "memory") {
        return memoryConsumerPreferences.get(uid) || { uid, locale: "en-ZA", notifyFollowedCompanies: true };
    }
    const snap = await getDoc(userPreferencesRef(uid));
    if (!snap.exists()) return { uid, locale: "en-ZA", notifyFollowedCompanies: true };
    return { uid, ...snap.data() };
}

/**
 * Ensure users/{uid} exists with accountKinds including consumer (eligibility flag only).
 */
async function ensureGlobalUserConsumerFlags(uid, { email, fullName } = {}) {
    if (getConfiguredStorageBackend() === "memory") {
        return;
    }
    const existing = await getUserProfile(uid);
    const kinds = new Set(normalizeKinds(existing));
    kinds.add(CONSUMER_ACCOUNT_KIND);
    await setDoc(
        globalUserRef(uid),
        {
            uid,
            email: email || existing?.email || null,
            fullName: fullName || existing?.fullName || null,
            accountKinds: [...kinds],
            updatedAt: serverTimestamp(),
            ...(existing ? {} : { createdAt: serverTimestamp(), status: "active" }),
        },
        { merge: true }
    );
}

/**
 * Create or return existing Sarah App consumer profile (idempotent bootstrap).
 * @param {string} uid
 * @param {{ email?: string, firstName?: string, lastName?: string, preferredName?: string, fullName?: string, popiaConsentVersion?: string }} input
 */
export async function bootstrapConsumerProfile(uid, input = {}) {
    if (!uid) {
        throw Object.assign(new Error("uid required"), { status: 400, code: "UID_REQUIRED" });
    }

    const existing = await getConsumerProfile(uid);
    if (existing) {
        return { created: false, profile: existing };
    }

    const firstName = String(input.firstName || input.preferredName || "").trim();
    const preferredName = String(input.preferredName || firstName || "").trim();
    const email = input.email ? String(input.email).trim() : null;
    const fullName =
        String(input.fullName || "").trim() ||
        [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
        preferredName ||
        null;

    const profile = {
        uid,
        email,
        firstName: firstName || null,
        lastName: input.lastName ? String(input.lastName).trim() : null,
        preferredName: preferredName || null,
        fullName,
        onboardingCompletedAt: null,
        popiaConsentVersion: input.popiaConsentVersion ? String(input.popiaConsentVersion) : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    if (getConfiguredStorageBackend() === "memory") {
        memoryConsumerProfiles.set(uid, profile);
        memoryConsumerPreferences.set(uid, {
            uid,
            locale: "en-ZA",
            notifyFollowedCompanies: true,
            allowPersonalSarahReadChats: false,
        });
        return { created: true, profile };
    }

    await setDoc(userProfileRef(uid), {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    await setDoc(
        userPreferencesRef(uid),
        {
            uid,
            locale: "en-ZA",
            notifyFollowedCompanies: true,
            allowPersonalSarahReadChats: false,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );

    await ensureGlobalUserConsumerFlags(uid, { email, fullName });

    return { created: true, profile: await getConsumerProfile(uid) };
}

const PROFILE_PATCH_KEYS = new Set([
    "firstName",
    "lastName",
    "preferredName",
    "fullName",
    "locale",
    "onboardingCompletedAt",
]);

/**
 * @param {string} uid
 * @param {Record<string, unknown>} patch
 */
export async function updateConsumerProfile(uid, patch = {}) {
    const current = await getConsumerProfile(uid);
    if (!current) {
        throw Object.assign(new Error("Consumer profile not found"), { status: 404, code: "CONSUMER_PROFILE_NOT_FOUND" });
    }

    const updates = {};
    for (const [key, value] of Object.entries(patch)) {
        if (PROFILE_PATCH_KEYS.has(key)) updates[key] = value;
    }
    if (patch.locale && getConfiguredStorageBackend() !== "memory") {
        await setDoc(userPreferencesRef(uid), { locale: patch.locale, updatedAt: serverTimestamp() }, { merge: true });
    }

    if (getConfiguredStorageBackend() === "memory") {
        const next = { ...current, ...updates, updatedAt: Date.now() };
        memoryConsumerProfiles.set(uid, next);
        return next;
    }

    await setDoc(userProfileRef(uid), { ...updates, updatedAt: serverTimestamp() }, { merge: true });
    return getConsumerProfile(uid);
}

export function consumerCollectionPathsForDocs() {
    return {
        userProfiles: `${ROOT.USER_PROFILES}/{uid}`,
        userPreferences: `${ROOT.USER_PREFERENCES}/{uid}`,
    };
}
