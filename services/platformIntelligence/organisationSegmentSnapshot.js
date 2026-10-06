import { segmentFromCompanyRecord } from "../../js/shared/organisationTaxonomy.js";

const cache = new Map();
const CACHE_TTL_MS = 60_000;

/**
 * Resolve organisation type + sector at event time (stored on events/rollups — not retroactive).
 * @param {string} companyId
 */
export async function resolveOrganisationSegmentSnapshot(companyId) {
    const id = String(companyId || "").trim();
    if (!id) {
        return {
            organisationType: "company",
            sectorId: "other",
            sectorLabel: "Other",
        };
    }

    const cached = cache.get(id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.snapshot;
    }

    let company = null;
    try {
        const { getCompany } = await import("../tenants/companyService.js");
        company = await getCompany(id);
    } catch {
        company = null;
    }

    const snapshot = segmentFromCompanyRecord(company || { id });
    if (!snapshot.sectorId) {
        snapshot.sectorId = "other";
        snapshot.sectorLabel = snapshot.sectorLabel || "Other";
    }

    cache.set(id, { at: Date.now(), snapshot });
    return snapshot;
}

/** @internal */
export function __clearOrganisationSegmentSnapshotCacheForTests() {
    cache.clear();
}
