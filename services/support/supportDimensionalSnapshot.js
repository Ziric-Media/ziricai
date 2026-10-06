/**
 * PI-4F-4 — Dimensional snapshots on support/remediation records (Support Intelligence).
 */
import { segmentFromCompanyRecord } from "../../js/shared/organisationTaxonomy.js";

export function buildSupportDimensions(company, supportCase = null) {
    const seg = segmentFromCompanyRecord(company || {});
    const base = {
        companyId: company?.id || supportCase?.companyId || null,
        companyName: company?.name || company?.id || null,
        organisationType: seg.organisationType || "company",
        sectorId: seg.sectorId || "other",
        sectorLabel: seg.sectorLabel || seg.sectorId || "other",
        country: company?.country || company?.address?.country || null,
        region: company?.region || company?.address?.region || null,
    };
    if (!supportCase) return base;
    return {
        ...base,
        affectedService: supportCase.affectedService || null,
        severity: supportCase.severity || supportCase.priority || null,
        category: supportCase.category || null,
        issue: supportCase.issue || supportCase.subject || null,
        sarahConfidence: supportCase.sarahConfidence ?? supportCase.diagnosis?.confidence ?? null,
    };
}
