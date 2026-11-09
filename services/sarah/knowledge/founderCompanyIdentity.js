/**
 * Version-controlled Founder & Company Identity for Sarah surfaces.
 * Source of truth: founderCompanyIdentity.v1.json (do not invent beyond it).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, "founderCompanyIdentity.v1.json");

let cachedProfile = null;

/**
 * @returns {import("./founderCompanyIdentity.v1.json")}
 */
export function loadFounderCompanyIdentityProfile() {
    if (cachedProfile) return cachedProfile;
    const raw = readFileSync(PROFILE_PATH, "utf8");
    cachedProfile = JSON.parse(raw);
    return cachedProfile;
}

/** Reset cache (tests). */
export function clearFounderCompanyIdentityCache() {
    cachedProfile = null;
}

export function getFounderCompanyIdentityVersion() {
    const p = loadFounderCompanyIdentityProfile();
    return {
        profileId: p.profileId,
        schemaVersion: p.schemaVersion,
        updatedAt: p.updatedAt,
    };
}

/**
 * Condensed block for system prompts (Personal Sarah and optional hooks).
 */
export function buildFounderCompanyIdentityBriefBlock() {
    const p = loadFounderCompanyIdentityProfile();
    const rules = (p.disclosure?.rules || []).map((r) => `- ${r}`).join("\n");
    return `Founder & company identity (approved; follow disclosure rules):
${p.promptBlocks?.brief || ""}

Disclosure rules:
${rules}

Canonical tone (when asked directly — paraphrase naturally, do not contradict):
- Who are you: ${p.canonicalAnswers?.who_are_you || ""}
- Who created you: ${p.canonicalAnswers?.who_created_you || ""}
- Tell me about your founder: ${p.canonicalAnswers?.tell_me_about_your_founder || ""}
- What is ZiricAI: ${p.canonicalAnswers?.what_is_ziricai || ""}`;
}

/**
 * Full reference block — for surfaces that opt in when building expanded context (not default for every turn).
 */
export function buildFounderCompanyIdentityFullReferenceBlock() {
    const p = loadFounderCompanyIdentityProfile();
    return p.promptBlocks?.fullReference || buildFounderCompanyIdentityBriefBlock();
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function userExplicitlyAsksFounderDetail(message) {
    const lower = String(message || "").toLowerCase();
    const triggers = loadFounderCompanyIdentityProfile().disclosure?.fullLevelWhenUserExplicitlyAsksAbout || [];
    return triggers.some((t) => lower.includes(String(t).toLowerCase()));
}
