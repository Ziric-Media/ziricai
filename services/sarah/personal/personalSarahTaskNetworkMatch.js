/**
 * ST-UX-03b — resolve task organisation against Sarah Network directory.
 */
import { searchDiscoverCompanies } from "../../users/businessDirectoryService.js";

/**
 * @param {object} task
 */
export function organisationQueryFromTask(task) {
    const meta = task?.meta || {};
    return String(
        meta.govDepartmentName ||
            meta.organisation ||
            meta.organization ||
            meta.company ||
            meta.institution ||
            ""
    ).trim();
}

/**
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export async function matchOrganisationOnNetwork(query, { limit = 5 } = {}) {
    const q = String(query || "").trim();
    if (q.length < 2) return { matches: [], query: q, total: 0 };
    const result = await searchDiscoverCompanies({ q, limit: Math.min(Math.max(limit, 1), 12) });
    const matches = (result.companies || []).map((c) => ({
        companyId: c.companyId,
        snId: c.snId || null,
        displayName: c.displayName,
        verified: Boolean(c.verified),
        categories: c.categories || [],
        city: c.city || null,
    }));
    return { matches, query: q, total: result.total ?? matches.length };
}