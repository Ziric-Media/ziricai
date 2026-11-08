/**
 * SNET-02 — backfill org entities (SN-IDs) for existing tenants. Dry-run by default.
 * Only eligible tenants (see networkEligibility) get an entity; entities are created `draft` (never auto-listed).
 */
import { evaluateNetworkEligibility } from "./networkEligibility.js";
import { ensureOrgEntity, getOrgEntityByCompanyId } from "./networkIdentityService.js";

/**
 * @param {object[]} companies tenant records (`id`, `name`, `settings`, …)
 * @param {{ apply?: boolean }} [opts]
 * @returns {Promise<{ dryRun: boolean, total: number, created: string[], existing: string[], skipped: Array<{ companyId: string, classification: string, reason: string }>, byClassification: Record<string, number> }>}
 */
export async function backfillOrgEntities(companies, { apply = false } = {}) {
    const report = { dryRun: !apply, total: companies.length, created: [], existing: [], skipped: [], byClassification: {} };
    for (const company of companies) {
        const companyId = company?.id || company?.companyId;
        if (!companyId) continue;
        const verdict = evaluateNetworkEligibility(company);
        report.byClassification[verdict.classification] = (report.byClassification[verdict.classification] || 0) + 1;
        if (!verdict.eligible) {
            report.skipped.push({ companyId, classification: verdict.classification, reason: verdict.reason });
            continue;
        }
        const existing = await getOrgEntityByCompanyId(companyId);
        if (existing) {
            report.existing.push(companyId);
            continue;
        }
        if (apply) await ensureOrgEntity(companyId, { displayName: company.name || companyId });
        report.created.push(companyId);
    }
    return report;
}
