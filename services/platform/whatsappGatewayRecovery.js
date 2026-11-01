/**
 * G5 — Read-only scan for registry ↔ tenant projection drift (no mutations).
 */
import { buildWhatsAppReconciliationReport } from "./reconcileWhatsAppPhoneAssignments.js";
import { listWhatsAppPoolNumbers } from "./whatsappNumberPoolService.js";
import { deriveAllocationStatus, ALLOCATION_ASSIGNED, ALLOCATION_SUSPENDED } from "./whatsappGatewayRegistry.js";

/**
 * @returns {Promise<{ generatedAt: string, issues: object[], summary: object }>}
 */
export async function scanWhatsAppGatewayProjectionDrift() {
    const report = await buildWhatsAppReconciliationReport({});
    const pool = await listWhatsAppPoolNumbers();
    const issues = [];

    for (const conflict of report.conflicts || []) {
        if (!conflict.registryVsTenantsAligned) {
            issues.push({
                type: "reconciliation_misaligned",
                phoneSuffix: conflict.phoneSuffix,
                activeIntegrationCount: conflict.activeIntegrationCount,
                registry: conflict.registry,
            });
        }
    }

    for (const row of pool) {
        const allocation = deriveAllocationStatus(row);
        if (allocation === ALLOCATION_SUSPENDED) {
            issues.push({
                type: "registry_suspended",
                poolId: row.id,
                assignedCompanyId: row.assignedCompanyId,
                note: "Manual recovery may be required after failed release",
            });
        }
        if (allocation === ALLOCATION_ASSIGNED && !row.phoneNumberId) {
            issues.push({ type: "assigned_missing_phone_id", poolId: row.id });
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        summary: {
            reconciliationConflicts: report.conflicts?.length ?? 0,
            misaligned: report.summary?.registryMisaligned ?? 0,
            issueCount: issues.length,
        },
        issues,
    };
}
