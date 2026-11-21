/**
 * SNET-01b — pilot listings seeded into the durable directory on first hydrate.
 *
 * Split out of businessDirectoryService so production directory code no longer imports demo fixtures.
 * These are *real tenants* (not UI fixtures): `SARAH_NETWORK_PILOT_COMPANY_IDS` (comma list, default SmileMore).
 * Once a tenant publishes through SNET-03 (`PUT …/listing` + `publish`) the stored directory doc wins over the seed.
 */
import {
    SMILEMORE_CONTACTS,
    SMILEMORE_DEMO_COMPANY_ID,
    SMILEMORE_PUBLIC_WEBSITE,
} from "../dental/smilemorePractice.js";
import { buildDentalPracticeDiscoverProducts } from "../dental/dentalPracticeProducts.js";

/** Public Discover profile for Smile More Dentists (pilot + startup seed). */
export function buildSmilemorePilotDiscoverProfile() {
    return {
        displayName: "Smile More Dentists",
        industry: "Healthcare · Dental",
        location: "Rustenburg, North West, South Africa",
        address: "Family: Shop 04, City Square Mall · Paediatric: Senthadi Centre, 147 Leyds St, Rustenburg",
        shortDescription:
            "Family and paediatric dental care in Rustenburg. Chat with Company Sarah for appointments and services, or visit smilemoredentists.co.za.",
        tags: ["dentist", "dental", "family", "paediatric", "rustenburg", "teeth", "orthodontics"],
        contact: {
            phone: SMILEMORE_CONTACTS.phone,
            email: SMILEMORE_CONTACTS.email,
            website: SMILEMORE_PUBLIC_WEBSITE,
        },
        hours: [
            { day: "Monday", time: "9:00 AM – 5:00 PM" },
            { day: "Tuesday", time: "9:00 AM – 5:00 PM" },
            { day: "Wednesday", time: "9:00 AM – 5:00 PM" },
            { day: "Thursday", time: "9:00 AM – 5:00 PM" },
            { day: "Friday", time: "9:00 AM – 5:00 PM" },
            { day: "Saturday", time: "9:00 AM – 1:00 PM" },
            { day: "Sunday", time: "Closed" },
        ],
        products: buildDentalPracticeDiscoverProducts(),
        verified: true,
        verificationSummary: {
            state: "verified",
            level: "operator_attestation",
            checks: ["operator_attestation"],
            source: "operator_pilot_attestation",
        },
    };
}

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
        if (smile) {
            return {
                companyId,
                discoverability: "public",
                country: "ZA",
                industryPresetId: null,
                seeded: true,
                ...buildSmilemorePilotDiscoverProfile(),
            };
        }
        return {
            companyId,
            discoverability: "public",
            displayName: companyId,
            industry: null,
            location: "South Africa",
            country: "ZA",
            shortDescription: "Business on Sarah App.",
            tags: [],
            industryPresetId: null,
            verified: false,
            verificationSummary: { state: "unverified", checks: [], source: null },
            seeded: true,
        };
    });
}
