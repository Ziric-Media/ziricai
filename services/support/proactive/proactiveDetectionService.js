/**
 * PI-4F-6 — Proactive detection scan → support cases → Attention Centre queues.
 */
import { listAllCompaniesFromStorage } from "../../tenants/companyService.js";
import {
    recordSupportDiagnosis,
    realignProactiveCaseMetadata,
    recordProactiveScanInvestigationAudit,
} from "../../tenants/supportCaseService.js";
import { upsertCorrelatedSupportCase } from "../supportCaseCorrelation.js";
import { runPortalSupportDiagnosisWorkflow } from "../portalSupportDiagnosisWorkflow.js";
import { getPlatformIntegrationsBoard } from "../../operations/platformMissionControlService.js";
import { evaluateProactiveFindingsForTenant } from "./proactiveDetectionRules.js";
import { shouldSuppressProactiveFinding } from "./proactiveDetectionDedupe.js";
import { getProactiveScanLimits } from "./proactiveDetectionConfig.js";
import { isProactiveMonitoringEnabled } from "./organisationProactiveEligibility.js";
import { buildProactiveScanAudit } from "./proactiveScanAudit.js";

const SYSTEM_CTX_BASE = { isSuperAdmin: true, uid: "proactive-detection" };

function investigationContext(input) {
    return {
        source: "proactive_scan",
        trigger: input.trigger || "new_finding",
        autoInvestigate: input.autoInvestigate !== false,
        findingRule: input.findingRule || null,
    };
}

async function runProactiveInvestigation(companyId, caseId, finding, trigger) {
    const ctx = { ...SYSTEM_CTX_BASE, companyId };
    await realignProactiveCaseMetadata(companyId, caseId, finding);

    const invCtx = investigationContext({
        trigger,
        autoInvestigate: true,
        findingRule: finding.ruleId,
    });

    const investigation = await runPortalSupportDiagnosisWorkflow(ctx, {
        message: finding.investigationMessage,
        affectedService: finding.affectedService,
        sessionCaseId: caseId,
        investigationContext: invCtx,
    });
    investigation.investigationContext = invCtx;

    const audit = buildProactiveScanAudit({
        finding,
        dedupeResult: trigger,
        existingCaseId: caseId,
        investigationTriggered: true,
        investigation,
    });
    await recordProactiveScanInvestigationAudit(companyId, caseId, audit);

    return { investigation, audit };
}

/**
 * @param {string} companyId
 * @param {object} finding
 * @param {{ autoInvestigate?: boolean }} options
 */
export async function applyProactiveFinding(companyId, finding, options = {}) {
    const autoInvestigate = options.autoInvestigate !== false;
    const suppress = await shouldSuppressProactiveFinding(companyId, finding);

    if (suppress.suppress) {
        if (suppress.reason === "duplicate_open" && autoInvestigate && suppress.caseId) {
            const { investigation, audit } = await runProactiveInvestigation(
                companyId,
                suppress.caseId,
                finding,
                "duplicate_open"
            );
            return {
                applied: false,
                skipped: "duplicate_open",
                investigated: true,
                caseId: suppress.caseId,
                investigationSuccess: investigation?.success === true,
                audit,
            };
        }
        return {
            applied: false,
            skipped: suppress.reason,
            investigated: false,
            caseId: suppress.caseId || null,
        };
    }

    const ctx = { ...SYSTEM_CTX_BASE, companyId };
    const { supportCase, correlated } = await upsertCorrelatedSupportCase(
        companyId,
        {
            subject: finding.subject,
            issue: finding.issue,
            affectedService: finding.affectedService,
            severity: finding.severity,
            category: finding.category,
            source: "proactive",
        },
        ctx
    );

    const detectedAt = new Date().toISOString();
    await recordSupportDiagnosis(
        companyId,
        supportCase.id,
        {
            summary: finding.issue,
            issueClass: finding.issueClass,
            affectedService: finding.affectedService,
            checksPerformed: [`proactive_rule:${finding.ruleId}`],
            evidence: finding.evidence,
            confidence: finding.confidence,
            sarahConfidence: finding.confidence,
            proactiveDetection: {
                ruleId: finding.ruleId,
                signature: finding.signature,
                detectedAt,
                severity: finding.severity,
                confidence: finding.confidence,
                evidence: finding.evidence,
            },
        },
        ctx
    );

    let investigation = null;
    let audit = null;
    if (autoInvestigate) {
        const inv = await runProactiveInvestigation(companyId, supportCase.id, finding, "new_finding");
        investigation = inv.investigation;
        audit = inv.audit;
    }

    return {
        applied: true,
        correlated,
        investigated: autoInvestigate,
        caseId: investigation?.data?.supportCase?.id || supportCase.id,
        investigationSuccess: investigation?.success === true,
        audit,
    };
}

/**
 * Platform-wide proactive scan (read models + tenant diagnostics only).
 * @param {{ maxTenants?: number, autoInvestigate?: boolean }} options
 */
export async function runPlatformProactiveDetectionScan(options = {}) {
    const limits = getProactiveScanLimits();
    const maxTenants = Math.min(options.maxTenants ?? limits.maxTenants, 500);
    const autoInvestigate = options.autoInvestigate ?? limits.autoInvestigate;

    const [companies, board] = await Promise.all([
        listAllCompaniesFromStorage(),
        getPlatformIntegrationsBoard().catch(() => null),
    ]);

    const errorIds = new Set(
        (board?.whatsappTenants?.error || []).map((t) => t.companyId).filter(Boolean)
    );

    const eligible = companies.filter((c) => isProactiveMonitoringEnabled(c));
    const sample = eligible.slice(0, maxTenants);
    let findingsTotal = 0;
    let applied = 0;
    let skipped = 0;
    let investigated = 0;
    const byRule = {};
    const investigationSummaries = [];

    for (const company of sample) {
        const findings = await evaluateProactiveFindingsForTenant(company, {
            integrationError: errorIds.has(company.id),
        });
        for (const finding of findings) {
            findingsTotal += 1;
            byRule[finding.ruleId] = (byRule[finding.ruleId] || 0) + 1;
            const result = await applyProactiveFinding(company.id, finding, { autoInvestigate });
            if (result.applied) applied += 1;
            else skipped += 1;
            if (result.investigated) {
                investigated += 1;
                investigationSummaries.push({
                    companyId: company.id,
                    caseId: result.caseId,
                    skipped: result.skipped || null,
                    findingRule: finding.ruleId,
                    finalLifecycle: result.audit?.finalLifecycle || null,
                    mayAutoRemediate: result.audit?.escalationPolicy?.mayAutoRemediate,
                    remediationExecuted: result.audit?.remediationExecuted,
                });
            }
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        scannedTenants: sample.length,
        eligibleTenants: eligible.length,
        excludedTenants: companies.length - eligible.length,
        findingsTotal,
        applied,
        skipped,
        investigated,
        byRule,
        investigationSummaries,
        meta: { readOnly: false, dataSource: "proactive_detection_scan" },
    };
}
