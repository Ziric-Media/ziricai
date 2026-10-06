/**
 * PI-4F-3 — Remediation audit records (tenant SoT).
 */
import { ServiceBase } from "../../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../../database/schema.js";
import { getCompany } from "../../tenants/companyService.js";
import { getSupportCase } from "../../tenants/supportCaseService.js";
import { buildSupportDimensions } from "../supportDimensionalSnapshot.js";

class RemediationAuditService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.SUPPORT_REMEDIATION_AUDITS);
    }
}

const auditService = new RemediationAuditService();

/**
 * @param {string} companyId
 * @param {object} record
 */
async function resolveDimensions(companyId, record) {
    if (record.dimensions) return record.dimensions;
    const [company, supportCase] = await Promise.all([
        getCompany(companyId).catch(() => null),
        record.supportCaseId
            ? getSupportCase(companyId, record.supportCaseId).catch(() => null)
            : Promise.resolve(null),
    ]);
    return buildSupportDimensions(company, supportCase);
}

export async function recordRemediationAudit(companyId, record) {
    const dimensions = await resolveDimensions(companyId, record);
    const payload = {
        supportCaseId: record.supportCaseId || null,
        action: record.action,
        requestedBy: record.requestedBy || "sarah",
        timestamp: record.timestamp || new Date().toISOString(),
        preconditions: record.preconditions || null,
        result: record.result || null,
        postVerification: record.postVerification || null,
        previousState: record.previousState || null,
        newState: record.newState || null,
        success: record.success === true,
        escalated: record.escalated === true,
        failureReason: record.failureReason || null,
        dimensions,
        diagnosis: record.diagnosis || null,
        phases: record.phases || {
            diagnosis: Boolean(record.diagnosis || dimensions?.issue),
            preconditions: record.preconditions?.ok === true,
            remediationAttempted: record.preconditions?.ok !== false && Boolean(record.result),
            postVerification: Boolean(record.postVerification),
            resolution: record.success ? "resolved" : record.escalated ? "escalated" : "failed",
        },
        outcome: record.outcome || (record.success ? "resolved" : record.escalated ? "escalated" : "failed"),
        sarahConfidence: record.sarahConfidence ?? dimensions?.sarahConfidence ?? null,
    };
    return auditService.create(companyId, payload);
}

export async function listRemediationAuditsPage(companyId, options = {}) {
    const limit = Math.min(Number(options.limit) || 50, 100);
    const page = await auditService.listPage(companyId, {
        max: limit,
        orderByField: "timestamp",
        orderDirection: "desc",
        startAfterId: options.cursor || null,
    });
    return page;
}

export async function listRemediationAuditsForCase(companyId, supportCaseId, { limit = 20 } = {}) {
    const items = await auditService.list(companyId, { max: limit });
    return items.filter((a) => a.supportCaseId === supportCaseId);
}
