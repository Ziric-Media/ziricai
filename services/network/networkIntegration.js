/**
 * SNET-11 — attach the opaque Sarah Network id (`snId`) to consumer-facing company conversation payloads.
 *
 * Read-only and best-effort: it never mints ids and never throws. A company with no network entity (never published,
 * never backfilled) simply gets `snId: null`. `companyId` stays in the payload for existing clients — `snId` is the
 * stable public handle going forward (SNET-00 §6, SNET-01a).
 */
import { getOrgEntityByCompanyId } from "./networkIdentityService.js";

/** @param {string} companyId @returns {Promise<string|null>} */
export async function snIdForCompany(companyId) {
    try {
        const entity = await getOrgEntityByCompanyId(companyId);
        return entity?.snId || null;
    } catch (err) {
        console.warn("[networkIntegration] snId lookup failed:", err.message);
        return null;
    }
}

/**
 * Resolve a set of company ids once each.
 * @param {Iterable<string>} companyIds
 * @returns {Promise<Map<string, string|null>>}
 */
export async function snIdsForCompanies(companyIds) {
    const unique = [...new Set([...companyIds].map((c) => String(c || "").trim()).filter(Boolean))];
    const entries = await Promise.all(unique.map(async (cid) => [cid, await snIdForCompany(cid)]));
    return new Map(entries);
}

/**
 * Return copies of the rows with `snId` set for rows that carry a `companyId`. Rows without a company
 * (people, groups) are returned untouched.
 * @template {{ companyId?: string }} T
 * @param {T[]} rows
 * @returns {Promise<(T & { snId?: string|null })[]>}
 */
export async function attachSnIds(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const map = await snIdsForCompanies(list.map((r) => r?.companyId));
    return list.map((r) => (r?.companyId ? { ...r, snId: map.get(String(r.companyId).trim()) ?? null } : r));
}

/**
 * @template {{ companyId?: string }} T
 * @param {T|null|undefined} row
 * @returns {Promise<(T & { snId?: string|null })|T|null|undefined>}
 */
export async function attachSnId(row) {
    if (!row || !row.companyId) return row;
    return { ...row, snId: await snIdForCompany(row.companyId) };
}
