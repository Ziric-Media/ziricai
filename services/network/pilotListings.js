/**
 * SNET-01b — pilot listings seeded into the durable directory on first hydrate.
 *
 * Split out of businessDirectoryService so production directory code no longer imports demo fixtures.
 * These are *real tenants* (not UI fixtures): `SARAH_NETWORK_PILOT_COMPANY_IDS` (comma list, default SmileMore).
 * Once a tenant publishes through SNET-03 (`PUT …/listing` + `publish`) the stored directory doc wins over the seed.
 */
import { SMILEMORE_DEMO_COMPANY_ID } from "../dental/smilemorePractice.js";

/** Real tenant seeded by services/storage/seedCentralMotorsPilot.js (a test pins this to the adapter constant). */
export const CENTRAL_MOTORS_RTB_PILOT_ID = "central-motors-rtb";

/**
 * Gate 4 — public profile for the second pilot tenant. Used only when the id is listed in
 * `SARAH_NETWORK_PILOT_COMPANY_IDS` (it is NOT listed by default) — or the tenant publishes through SNET-03, in which
 * case the stored directory doc wins. Never verified by code: the badge stays "unverified" until a verification case
 * is approved. Client Zero and demo tenants are not part of this list and stay out of Discover.
 */
const PILOT_PROFILES = {
    [CENTRAL_MOTORS_RTB_PILOT_ID]: {
        displayName: "Central Motors Rustenburg",
        industry: "Automotive · Vehicle dealership",
        location: "Rustenburg, North West, South Africa",
        shortDescription:
            "Vehicle dealership in Rustenburg. Chat with Company Sarah about live stock, test drives, finance and trade-ins.",
        tags: ["cars", "vehicles", "dealership", "used cars", "test drive", "finance", "trade-in"],
    },
};

/** @returns {object[]} directory entries (companyId-keyed) */
export function buildPilotSeedEntries() {
    const ids = String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || SMILEMORE_DEMO_COMPANY_ID)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return ids.map((companyId) => {
        const smile = companyId === SMILEMORE_DEMO_COMPANY_ID;
        const profile = PILOT_PROFILES[companyId];
        if (profile) {
            return {
                companyId,
                discoverability: "public",
                ...profile,
                country: "ZA",
                industryPresetId: null,
                verified: false,
                verificationSummary: { state: "unverified", checks: [], source: null },
                seeded: true,
            };
        }
        return {
            companyId,
            discoverability: "public",
            displayName: smile ? "SmileMore Dentists" : companyId,
            industry: smile ? "Healthcare · Dental" : null,
            location: smile ? "Rustenburg, South Africa" : "South Africa",
            country: "ZA",
            shortDescription: smile
                ? "Family and paediatric dental care. Chat with Company Sarah for services and appointments."
                : "Business on Sarah App.",
            tags: smile ? ["dentist", "dental", "teeth", "orthodontics", "paediatric"] : [],
            industryPresetId: null,
            verified: smile,
            // Honest provenance: pilot "verified" is an operator attestation, not a registry check.
            verificationSummary: smile
                ? { state: "verified", level: "operator_attestation", checks: ["operator_attestation"], source: "operator_pilot_attestation" }
                : { state: "unverified", checks: [], source: null },
            seeded: true,
        };
    });
}
