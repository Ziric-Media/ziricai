/**
 * SN-01 — Sarah News profile on consumer preferences.
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { getConsumerPreferences } from "../../users/consumerProfileService.js";
import { setDoc, userPreferencesRef, serverTimestamp } from "../../database/firestoreClient.js";
import { syncSarahNewsSubscriber } from "./sarahNewsSubscriberIndex.js";

const memoryNewsProfiles = new Map();

export const DEFAULT_SARAH_NEWS_PROFILE = Object.freeze({
    regions: ["za", "zw", "world"],
    interests: ["shorts", "business", "tech", "sports", "politics"],
    briefings: { morning: true, lunch: true, evening: true },
    briefingTimes: { morning: "07:00", lunch: "12:30", evening: "18:30" },
    followTopics: [],
    breaking: false,
    language: "en",
});

function normalizeBriefingTimes(input = {}) {
    const base = { ...DEFAULT_SARAH_NEWS_PROFILE.briefingTimes };
    for (const key of ["morning", "lunch", "evening"]) {
        const raw = input[key];
        if (!raw) continue;
        const m = String(raw).match(/^(\d{1,2}):(\d{2})$/);
        if (m) base[key] = `${String(m[1]).padStart(2, "0")}:${m[2]}`;
    }
    return base;
}

function normalizeFollowTopics(input) {
    const fromArray = Array.isArray(input) ? input : [];
    const topics = fromArray
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 24);
    return [...new Set(topics.map((t) => t.slice(0, 80)))];
}

function normalizeProfile(input = {}) {
    const briefings = { ...DEFAULT_SARAH_NEWS_PROFILE.briefings, ...(input.briefings || {}) };
    return {
        regions: Array.isArray(input.regions) ? input.regions.map(String).slice(0, 12) : [],
        interests: Array.isArray(input.interests) ? input.interests.map(String).slice(0, 20) : [],
        briefings,
        briefingTimes: normalizeBriefingTimes(input.briefingTimes || {}),
        followTopics: normalizeFollowTopics(input.followTopics),
        breaking: Boolean(input.breaking),
        language: String(input.language || "en").slice(0, 12),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * @param {object} profile
 * @param {string} topic
 */
export async function addSarahNewsFollowTopic(uid, profile, topic) {
    const next = normalizeFollowTopics([...(profile?.followTopics || []), topic]);
    if (next.length === (profile?.followTopics || []).length) {
        return { profile, added: false, topic: String(topic).trim() };
    }
    const updated = await setSarahNewsProfile(uid, { ...profile, followTopics: next });
    return { profile: updated, added: true, topic: String(topic).trim() };
}

/**
 * @param {object} profile
 * @param {string} topic
 */
export async function removeSarahNewsFollowTopic(uid, profile, topic) {
    const needle = String(topic || "").trim().toLowerCase();
    const next = (profile?.followTopics || []).filter((t) => String(t).toLowerCase() !== needle);
    if (next.length === (profile?.followTopics || []).length) {
        return { profile, removed: false, topic: String(topic).trim() };
    }
    const updated = await setSarahNewsProfile(uid, { ...profile, followTopics: next });
    return { profile: updated, removed: true, topic: String(topic).trim() };
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
        await syncSarahNewsSubscriber(uid, profile);
        return profile;
    }
    await setDoc(
        userPreferencesRef(uid),
        { sarahNews: profile, updatedAt: serverTimestamp() },
        { merge: true }
    );
    await syncSarahNewsSubscriber(uid, profile);
    return profile;
}

export function clearSarahNewsProfilesForTests() {
    memoryNewsProfiles.clear();
}