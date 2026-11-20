/**
 * SN-01 — Sarah News profile on consumer preferences.
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { getConsumerPreferences } from "../../users/consumerProfileService.js";
import { setDoc, userPreferencesRef, serverTimestamp } from "../../database/firestoreClient.js";

const memoryNewsProfiles = new Map();

export const DEFAULT_SARAH_NEWS_PROFILE = Object.freeze({
    regions: ["za", "zw", "world"],
    interests: ["business", "tech", "sports", "politics"],
    briefings: { morning: true, lunch: true, evening: true },
    breaking: false,
    language: "en",
});

function normalizeProfile(input = {}) {
    const briefings = { ...DEFAULT_SARAH_NEWS_PROFILE.briefings, ...(input.briefings || {}) };
    return {
        regions: Array.isArray(input.regions) ? input.regions.map(String).slice(0, 12) : [],
        interests: Array.isArray(input.interests) ? input.interests.map(String).slice(0, 20) : [],
        briefings,
        breaking: Boolean(input.breaking),
        language: String(input.language || "en").slice(0, 12),
        updatedAt: new Date().toISOString(),
    };
}

export async function getSarahNewsProfile(uid) {
    if (!uid) return null;
    if (getConfiguredStorageBackend() === "memory") {
        return memoryNewsProfiles.get(uid) || null;
    }
    const prefs = await getConsumerPreferences(uid);
    return prefs?.sarahNews ? { ...prefs.sarahNews } : null;
}

export async function setSarahNewsProfile(uid, input = {}) {
    if (!uid) {
        throw Object.assign(new Error("uid required"), { status: 400, code: "UID_REQUIRED" });
    }
    const profile = normalizeProfile(input);
    if (getConfiguredStorageBackend() === "memory") {
        memoryNewsProfiles.set(uid, profile);
        return profile;
    }
    await setDoc(
        userPreferencesRef(uid),
        { sarahNews: profile, updatedAt: serverTimestamp() },
        { merge: true }
    );
    return profile;
}

export function clearSarahNewsProfilesForTests() {
    memoryNewsProfiles.clear();
}