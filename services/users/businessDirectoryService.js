/**
 * U4/U6 — public discoverability gate for Sarah Network (memory + tenant seed).
 */
import { SMILEMORE_DEMO_COMPANY_ID } from "../dental/smilemorePractice.js";

/** @type {Map<string, object>} */
const directory = new Map();

function seedPilotCompanies() {
    const extra = String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || SMILEMORE_DEMO_COMPANY_ID)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    for (const companyId of extra) {
        if (!directory.has(companyId)) {
            directory.set(companyId, {
                companyId,
                discoverability: "public",
                displayName:
                    companyId === SMILEMORE_DEMO_COMPANY_ID ? "SmileMore Dentists" : companyId,
                industry: companyId === SMILEMORE_DEMO_COMPANY_ID ? "Healthcare · Dental" : null,
                location: "Rustenburg, South Africa",
                shortDescription:
                    companyId === SMILEMORE_DEMO_COMPANY_ID
                        ? "Family and paediatric dental care. Chat with Company Sarah for services and appointments."
                        : "Verified business on Sarah App.",
                industryPresetId: null,
                verified: companyId === SMILEMORE_DEMO_COMPANY_ID,
            });
        }
    }
}

seedPilotCompanies();

/**
 * @param {string} companyId
 */
export function getBusinessDirectoryEntry(companyId) {
    return directory.get(companyId) || null;
}

/**
 * @param {string} companyId
 */
export function assertCompanyDiscoverable(companyId) {
    const entry = getBusinessDirectoryEntry(companyId);
    if (!entry || entry.discoverability !== "public") {
        throw Object.assign(new Error("This business is not available on Sarah Discover yet."), {
            status: 404,
            code: "COMPANY_NOT_DISCOVERABLE",
        });
    }
    return entry;
}

/**
 * @param {string} companyId
 * @param {object} data
 */
export function upsertBusinessDirectoryEntry(companyId, data) {
    const existing = directory.get(companyId) || { companyId };
    const next = { ...existing, ...data, companyId, updatedAt: new Date().toISOString() };
    directory.set(companyId, next);
    return next;
}

export function clearBusinessDirectoryForTests() {
    directory.clear();
    seedPilotCompanies();
}
