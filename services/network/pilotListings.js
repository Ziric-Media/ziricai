/**
 * SNET-01b — pilot listings seeded into the durable directory on first hydrate.
 *
 * Split out of businessDirectoryService so production directory code no longer imports demo fixtures.
 * These are *real tenants* (not UI fixtures): `SARAH_NETWORK_PILOT_COMPANY_IDS` (comma list, default SmileMore).
 * Once a tenant publishes through SNET-03 (`PUT …/listing` + `publish`) the stored directory doc wins over the seed.
 */
import { SMILEMORE_DEMO_COMPANY_ID } from "../dental/smilemorePractice.js";

/** @returns {object[]} directory entries (companyId-keyed) */
export function buildPilotSeedEntries() {
    const ids = String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || SMILEMORE_DEMO_COMPANY_ID)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return ids.map((companyId) => {
        const smile = companyId === SMILEMORE_DEMO_COMPANY_ID;
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
