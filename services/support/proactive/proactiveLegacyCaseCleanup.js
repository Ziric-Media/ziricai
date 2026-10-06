/**
 * PI-4F-6 — Classify legacy proactive cases for superseded cleanup (false-positive burst).
 */
import { PROACTIVE_DETECTION_RULES } from "./proactiveDetectionConfig.js";
import { isProactiveMonitoringEnabled, resolveOrganisationEnvironment } from "./organisationProactiveEligibility.js";
import { isActualCredentialFailure } from "./whatsappProactiveSignals.js";

function evidenceLines(caseRecord) {
    const pd = caseRecord.diagnosis?.proactiveDetection;
    const rows = pd?.evidence || caseRecord.diagnosis?.evidence || [];
    return rows.map((e) => String(e.detail || e.message || JSON.stringify(e)));
}

export function isSetupOnlyCredentialEvidence(caseRecord) {
    const lines = evidenceLines(caseRecord);
    if (!lines.length) {
        const blob = `${caseRecord.issue || ""} ${caseRecord.diagnosis?.summary || ""}`;
        return !isActualCredentialFailure(blob);
    }
    let hasAuthEvidence = false;
    let hasSetupOnly = false;
    for (const line of lines) {
        if (isActualCredentialFailure(line)) {
            hasAuthEvidence = true;
        }
        if (/runtimeReady=|missing=|present=false|not configured/i.test(line)) {
            hasSetupOnly = true;
        }
    }
    return hasSetupOnly && !hasAuthEvidence;
}

/**
 * @param {object} caseRecord
 * @param {object} company
 * @returns {{ eligible: boolean, reason: string|null }}
 */
export function classifyLegacyProactiveCleanup(caseRecord, company) {
    if (!caseRecord?.id) {
        return { eligible: false, reason: "missing_case" };
    }
    if (String(caseRecord.status || "").toLowerCase() === "resolved") {
        return { eligible: false, reason: "already_resolved" };
    }

    const pd = caseRecord.diagnosis?.proactiveDetection;
    const ruleId = pd?.ruleId || null;
    const source = String(caseRecord.source || "").toLowerCase();

    if (source !== "proactive" && !ruleId) {
        return { eligible: false, reason: "not_proactive_case" };
    }

    if (ruleId === PROACTIVE_DETECTION_RULES.WHATSAPP_NOT_CONFIGURED) {
        return { eligible: true, reason: "whatsapp_not_configured_burst" };
    }

    if (
        ruleId === PROACTIVE_DETECTION_RULES.WHATSAPP_CREDENTIALS ||
        (source === "proactive" &&
            String(caseRecord.diagnosis?.issueClass || "").toLowerCase() === "credentials")
    ) {
        if (!isProactiveMonitoringEnabled(company)) {
            return { eligible: true, reason: "credentials_on_gate_test_environment" };
        }
        if (isSetupOnlyCredentialEvidence(caseRecord)) {
            return { eligible: true, reason: "obsolete_setup_only_whatsapp_credentials" };
        }
        return { eligible: false, reason: "retain_legitimate_or_ambiguous_credentials" };
    }

    return { eligible: false, reason: "out_of_cleanup_scope" };
}

export function buildCleanupAuditRecord(caseRecord, company, classification) {
    const pd = caseRecord.diagnosis?.proactiveDetection || {};
    return {
        caseId: caseRecord.id,
        companyId: company?.id || caseRecord.companyId,
        organisation: company?.name || company?.id || caseRecord.companyId,
        environment: resolveOrganisationEnvironment(company || {}),
        previousStatus: caseRecord.status,
        cleanupReason: classification.reason,
        originalDetectionRule: pd.ruleId || null,
        originalEvidence: pd.evidence || caseRecord.diagnosis?.evidence || [],
        cleanupTimestamp: new Date().toISOString(),
        cleanupActor: "system_cleanup",
        newStatus: "resolved",
    };
}
