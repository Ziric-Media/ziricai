/**
 * SNET-02/03 — server-side tenant eligibility for Sarah Network (audit risk R4: classification was browser-only).
 *
 * A tenant may hold a *listed* network presence only when it is a real tenant:
 *   PRODUCTION CUSTOMER · CLIENT ZERO · PILOT   — or explicitly allow-listed (`SARAH_NETWORK_PILOT_COMPANY_IDS`).
 * ACCEPTANCE, DEMO/SHOWCASE, TEST and UNKNOWN tenants never list (UNKNOWN stays out until an operator classifies it).
 */
import { classifyTenant, TENANT_CLASS } from "../../js/shared/tenantClassification.js";

const LISTABLE = new Set([TENANT_CLASS.PRODUCTION_CUSTOMER, TENANT_CLASS.CLIENT_ZERO, TENANT_CLASS.PILOT]);

function allowListed(companyId) {
    return String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || "smilemore-demo")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(companyId);
}

/**
 * @param {{ id?: string, companyId?: string, name?: string, settings?: object, ownerEmail?: string }} company
 * @returns {{ eligible: boolean, classification: string, reason: string, evidence: string[] }}
 */
export function evaluateNetworkEligibility(company) {
    const companyId = company?.id || company?.companyId || "";
    const c = classifyTenant({ ...company, id: companyId });
    if (allowListed(companyId)) {
        return { eligible: true, classification: c.classification, reason: "pilot_allowlist", evidence: c.evidence };
    }
    if (LISTABLE.has(c.classification)) {
        return { eligible: true, classification: c.classification, reason: "class_listable", evidence: c.evidence };
    }
    return {
        eligible: false,
        classification: c.classification,
        reason: `class_${String(c.classification).toLowerCase().replace(/[^a-z]+/g, "_")}`,
        evidence: c.evidence,
    };
}
