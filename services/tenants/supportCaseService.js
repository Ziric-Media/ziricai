/**
 * MC-U-4C + PI-4F-1 — Tenant-scoped SupportCase (authoritative store).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { toIsoTimestamp } from "../core/timestampUtils.js";
import { normalizeRole } from "../auth/authService.js";
import { publish, EventTypes } from "../events/index.js";
import {
    SUPPORT_CASE_STATUSES,
    SUPPORT_CASE_PRIORITIES,
    SUPPORT_CASE_SOURCES,
    SUPPORT_CASE_CATEGORIES,
    ALLOWED_LIFECYCLE_TRANSITIONS,
    severityFromPriority,
    priorityFromSeverity,
} from "../support/supportCaseModel.js";
import { evaluateEscalationPolicy } from "../support/escalationPolicy.js";

export {
    SUPPORT_CASE_STATUSES,
    SUPPORT_CASE_PRIORITIES,
    SUPPORT_CASE_SOURCES,
    SUPPORT_CASE_CATEGORIES,
};

const PATCH_ROLES = new Set(["owner", "manager", "support"]);

const ALLOWED_TRANSITIONS = ALLOWED_LIFECYCLE_TRANSITIONS;

class SupportCaseService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.SUPPORT_CASES);
    }
}

class SupportCaseActivityService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.SUPPORT_CASE_ACTIVITIES);
    }
}

const caseService = new SupportCaseService();
const activityService = new SupportCaseActivityService();

export function serializeSupportCase(record) {
    if (!record || typeof record !== "object") return record;
    return {
        ...record,
        createdAt: toIsoTimestamp(record.createdAt) || record.createdAt,
        updatedAt: toIsoTimestamp(record.updatedAt) || record.updatedAt,
        resolvedAt: record.resolvedAt ? toIsoTimestamp(record.resolvedAt) : null,
        lastActivityAt: record.lastActivityAt ? toIsoTimestamp(record.lastActivityAt) : null,
    };
}

export function canPatchSupportCase(ctx) {
    if (ctx?.isSuperAdmin) return true;
    const role = normalizeRole(ctx?.profile?.role || ctx?.role);
    return PATCH_ROLES.has(role);
}

function assertCategory(category) {
    const c = String(category || "general").toLowerCase();
    if (!SUPPORT_CASE_CATEGORIES.includes(c)) {
        throw Object.assign(new Error(`Invalid category: ${category}`), { status: 400, code: "INVALID_CATEGORY" });
    }
    return c;
}

function assertPriority(priority) {
    const p = String(priority || "medium").toLowerCase();
    if (!SUPPORT_CASE_PRIORITIES.includes(p)) {
        throw Object.assign(new Error(`Invalid priority: ${priority}`), { status: 400, code: "INVALID_PRIORITY" });
    }
    return p;
}

function assertStatus(status) {
    const s = String(status || "open").toLowerCase();
    if (!SUPPORT_CASE_STATUSES.includes(s)) {
        throw Object.assign(new Error(`Invalid status: ${status}`), { status: 400, code: "INVALID_STATUS" });
    }
    return s;
}

function assertSource(source) {
    const s = String(source || "portal").toLowerCase();
    if (!SUPPORT_CASE_SOURCES.includes(s)) {
        throw Object.assign(new Error(`Invalid source: ${source}`), { status: 400, code: "INVALID_SOURCE" });
    }
    return s;
}

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.has(to)) {
        throw Object.assign(new Error(`Invalid status transition: ${from} → ${to}`), {
            status: 400,
            code: "INVALID_STATUS_TRANSITION",
        });
    }
}

async function recordActivity(companyId, activity) {
    const entry = {
        type: activity.type || "system",
        caseId: activity.caseId,
        actorUserId: activity.actorUserId || null,
        message: activity.message || null,
        fromStatus: activity.fromStatus || null,
        toStatus: activity.toStatus || null,
    };
    const saved = await activityService.create(companyId, entry);
    return saved;
}

export async function listSupportCasesPage(companyId, options = {}) {
    const { status, priority, category, assigneeId, limit = 50, cursor = null } = options;
    const filters = {};
    if (status) filters.status = assertStatus(status);
    if (priority) filters.priority = assertPriority(priority);
    if (category) filters.category = assertCategory(category);
    if (assigneeId) filters.assigneeId = String(assigneeId);

    const page = await caseService.listPage(companyId, {
        max: limit,
        orderByField: "updatedAt",
        orderDirection: "desc",
        filters,
        startAfterId: cursor,
    });
    return {
        companyId,
        items: page.items.map(serializeSupportCase),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
    };
}

export async function getSupportCase(companyId, caseId) {
    const record = await caseService.get(companyId, caseId);
    if (!record) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    return serializeSupportCase(record);
}

export async function createSupportCase(companyId, input, ctx = {}) {
    const subject = String(input.subject || "").trim();
    if (!subject) {
        throw Object.assign(new Error("subject is required"), { status: 400, code: "MISSING_SUBJECT" });
    }
    if (subject.length > 200) {
        throw Object.assign(new Error("subject must be at most 200 characters"), { status: 400, code: "SUBJECT_TOO_LONG" });
    }

    const createdByUserId = ctx.uid || input.createdByUserId || null;
    if (!createdByUserId && !ctx.isSuperAdmin) {
        throw Object.assign(new Error("Authenticated user required to create a support case"), {
            status: 401,
            code: "UNAUTHORIZED",
        });
    }

    const now = new Date().toISOString();
    const severityInput = input.severity ? String(input.severity).toLowerCase() : null;
    const priority = assertPriority(
        input.priority || (severityInput && priorityFromSeverity(severityInput)) || "medium"
    );

    const payload = {
        subject,
        issue: input.issue ? String(input.issue).trim() : subject,
        description: input.description ? String(input.description).trim() : null,
        category: assertCategory(input.category),
        priority,
        severity: severityInput || severityFromPriority(priority),
        status: "open",
        source: assertSource(input.source),
        affectedService: input.affectedService ? String(input.affectedService).toLowerCase() : null,
        diagnosis: input.diagnosis || null,
        actionsAttempted: Array.isArray(input.actionsAttempted) ? input.actionsAttempted : [],
        sarahConfidence: input.sarahConfidence ?? null,
        escalation: null,
        resolution: null,
        customerId: input.customerId ? String(input.customerId) : null,
        conversationId: input.conversationId ? String(input.conversationId) : null,
        createdByUserId,
        requesterName: input.requesterName ? String(input.requesterName) : null,
        requesterEmail: input.requesterEmail ? String(input.requesterEmail) : null,
        requesterPhone: input.requesterPhone ? String(input.requesterPhone) : null,
        assigneeType: "unassigned",
        assigneeId: null,
        assigneeName: null,
        externalProvider: null,
        externalId: null,
        resolvedAt: null,
        lastActivityAt: now,
        lastActivitySummary: "Case opened",
    };

    const saved = await caseService.create(companyId, payload);
    await recordActivity(companyId, {
        type: "created",
        caseId: saved.id,
        actorUserId: createdByUserId,
        message: "Support case created",
        toStatus: "open",
    });

    await publish(companyId, EventTypes.SUPPORT_TICKET_CREATED, {
        supportCaseId: saved.id,
        subject: saved.subject,
        category: saved.category,
        priority: saved.priority,
        source: saved.source,
        conversationId: saved.conversationId,
        customerId: saved.customerId,
    });

    return serializeSupportCase(saved);
}

export async function patchSupportCase(companyId, caseId, patch, ctx) {
    if (!canPatchSupportCase(ctx)) {
        throw Object.assign(new Error("Only owner, manager, or support roles may update support cases"), {
            status: 403,
            code: "SUPPORT_PATCH_FORBIDDEN",
        });
    }

    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }

    const updates = {};
    const activities = [];

    if (patch.status !== undefined) {
        const next = assertStatus(patch.status);
        const prev = assertStatus(existing.status);
        if (next !== prev) {
            assertTransition(prev, next);
            updates.status = next;
            if (next === "resolved") {
                updates.resolvedAt = new Date().toISOString();
            }
            activities.push({
                type: "status_changed",
                fromStatus: prev,
                toStatus: next,
                message: `Status changed to ${next}`,
            });
        }
    }

    if (patch.priority !== undefined) {
        updates.priority = assertPriority(patch.priority);
        updates.severity = severityFromPriority(updates.priority);
    }

    if (patch.severity !== undefined) {
        const sev = String(patch.severity).toLowerCase();
        updates.severity = sev;
        updates.priority = assertPriority(priorityFromSeverity(sev));
    }

    if (patch.category !== undefined) {
        updates.category = assertCategory(patch.category);
    }

    if (patch.assigneeId !== undefined || patch.assigneeName !== undefined || patch.assigneeType !== undefined) {
        const assigneeType = patch.assigneeType || (patch.assigneeId ? "tenant_user" : "unassigned");
        updates.assigneeType = assigneeType;
        updates.assigneeId = patch.assigneeId ? String(patch.assigneeId) : null;
        updates.assigneeName = patch.assigneeName ? String(patch.assigneeName) : null;
        if (patch.assigneeId && existing.status === "open") {
            updates.status = "assigned";
            activities.push({
                type: "assigned",
                fromStatus: existing.status,
                toStatus: "assigned",
                message: updates.assigneeName
                    ? `Assigned to ${updates.assigneeName}`
                    : "Case assigned",
            });
        }
    }

    if (patch.description !== undefined) {
        updates.description = patch.description ? String(patch.description).trim() : null;
    }

    if (!Object.keys(updates).length) {
        return serializeSupportCase(existing);
    }

    const now = new Date().toISOString();
    updates.lastActivityAt = now;
    if (activities.length) {
        updates.lastActivitySummary = activities[activities.length - 1].message;
    }

    const saved = await caseService.update(companyId, caseId, updates);

    for (const act of activities) {
        await recordActivity(companyId, {
            ...act,
            caseId,
            actorUserId: ctx.uid || null,
        });
    }

    return serializeSupportCase(saved);
}

export async function recordSupportDiagnosis(companyId, caseId, diagnosis, ctx = {}) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    const prevPd = existing.diagnosis?.proactiveDetection || null;
    const payload = {
        diagnosis: {
            summary: String(diagnosis.summary || "").trim(),
            issueClass: diagnosis.issueClass || null,
            affectedService: diagnosis.affectedService || existing.affectedService,
            checksPerformed: diagnosis.checksPerformed || [],
            evidence: diagnosis.evidence || [],
            confidence: diagnosis.confidence || null,
            proactiveDetection:
                diagnosis.proactiveDetection !== undefined ? diagnosis.proactiveDetection : prevPd,
            recordedAt: new Date().toISOString(),
            recordedBy: ctx.uid || "sarah",
        },
        lastActivityAt: new Date().toISOString(),
        lastActivitySummary: "Diagnosis recorded",
    };
    if (diagnosis.sarahConfidence != null || diagnosis.confidence != null) {
        payload.sarahConfidence = diagnosis.sarahConfidence ?? diagnosis.confidence;
    }
    if (existing.status === "open") {
        payload.status = "investigating";
    }
    const saved = await caseService.update(companyId, caseId, payload);
    await recordActivity(companyId, {
        type: "diagnosis_recorded",
        caseId,
        actorUserId: ctx.uid || null,
        message: payload.diagnosis.summary || "Diagnosis recorded",
        fromStatus: existing.status,
        toStatus: payload.status || existing.status,
    });
    return serializeSupportCase(saved);
}

export async function appendRemediationAttempt(companyId, caseId, attempt, ctx = {}) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    const entry = {
        tool: String(attempt.tool || "unknown"),
        outcome: String(attempt.outcome || "pending"),
        message: attempt.message ? String(attempt.message) : null,
        verified: attempt.verified === true,
        at: new Date().toISOString(),
        actor: ctx.uid || attempt.actor || "sarah",
    };
    const actions = [...(existing.actionsAttempted || []), entry];
    const failedCount = actions.filter((a) => a.outcome === "failed").length;
    const policy = evaluateEscalationPolicy({
        issueClass: existing.diagnosis?.issueClass,
        category: existing.category,
        severity: existing.severity || severityFromPriority(existing.priority),
        failedRemediationCount: failedCount,
        requiresDestructiveAction: attempt.destructive === true,
        billingDispute: attempt.billingDispute === true,
    });

    const updates = {
        actionsAttempted: actions,
        lastActivityAt: entry.at,
        lastActivitySummary: `Remediation: ${entry.tool} → ${entry.outcome}`,
    };

    if (policy.mustEscalate && existing.status !== "resolved") {
        updates.status = "escalated";
        updates.escalation = {
            escalatedAt: entry.at,
            reason: policy.reasons.join("; ") || "Policy escalation",
            ruleId: policy.matchedRule,
            failedRemediationCount: failedCount,
        };
    }

    const saved = await caseService.update(companyId, caseId, updates);
    await recordActivity(companyId, {
        type: "remediation_attempted",
        caseId,
        actorUserId: ctx.uid || null,
        message: updates.lastActivitySummary,
    });
    return { supportCase: serializeSupportCase(saved), escalationPolicy: policy };
}

export async function escalateSupportCase(companyId, caseId, input, ctx = {}) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    const now = new Date().toISOString();
    const reason = String(input.reason || input.escalationReason || "Escalated to platform operator").trim();
    const updates = {
        status: "escalated",
        escalation: {
            escalatedAt: now,
            reason,
            ruleId: input.ruleId || input.matchedRule || "manual",
            sarahConfidence: input.sarahConfidence ?? existing.sarahConfidence,
            recommendedOperatorAction: input.recommendedOperatorAction || null,
        },
        sarahConfidence: input.sarahConfidence ?? existing.sarahConfidence,
        lastActivityAt: now,
        lastActivitySummary: `Escalated: ${reason.slice(0, 120)}`,
    };
    const saved = await caseService.update(companyId, caseId, updates);
    await recordActivity(companyId, {
        type: "escalated",
        caseId,
        actorUserId: ctx.uid || null,
        message: reason,
        toStatus: "escalated",
    });
    return serializeSupportCase(saved);
}

export async function resolveSupportCaseWithVerification(companyId, caseId, resolution, ctx = {}) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    const now = new Date().toISOString();
    const updates = {
        status: "resolved",
        resolvedAt: now,
        resolution: {
            summary: String(resolution.summary || "Resolved").trim(),
            resolvedBy: ctx.uid || resolution.resolvedBy || "sarah",
            autoResolved: resolution.autoResolved === true,
            verifiedAt: resolution.verifiedAt || now,
        },
        lastActivityAt: now,
        lastActivitySummary: "Case resolved",
    };
    const saved = await caseService.update(companyId, caseId, updates);
    await recordActivity(companyId, {
        type: "resolved",
        caseId,
        actorUserId: ctx.uid || null,
        toStatus: "resolved",
        message: updates.resolution.summary,
    });
    return serializeSupportCase(saved);
}

/**
 * PI-4F-6 — Close legacy proactive false positives without implying Sarah verified resolution.
 * @param {object} auditPayload — cleanup audit (caseId, cleanupReason, originalEvidence, …)
 */
export async function supersedeSupportCaseForDetectionCleanup(companyId, caseId, auditPayload) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }
    if (String(existing.status || "").toLowerCase() === "resolved") {
        return { skipped: true, reason: "already_resolved", supportCase: serializeSupportCase(existing) };
    }

    const prev = assertStatus(existing.status);
    const next = "resolved";
    if (prev !== next) {
        assertTransition(prev, next);
    }

    const now = new Date().toISOString();
    const summary =
        "Superseded by PI-4F-6 detection-rule correction (legacy proactive false positive — not verified by Sarah)";

    const updates = {
        status: next,
        resolvedAt: now,
        resolution: {
            summary,
            autoResolved: false,
            superseded: true,
            verifiedAt: null,
            cleanup: auditPayload,
        },
        lastActivityAt: now,
        lastActivitySummary: "Superseded (system cleanup)",
    };

    const saved = await caseService.update(companyId, caseId, updates);

    await activityService.create(companyId, {
        type: "proactive_cleanup_audit",
        caseId,
        actorUserId: "system_cleanup",
        message: auditPayload.cleanupReason || summary,
        fromStatus: prev,
        toStatus: next,
        audit: auditPayload,
    });

    await recordActivity(companyId, {
        type: "resolved",
        caseId,
        actorUserId: "system_cleanup",
        fromStatus: prev,
        toStatus: next,
        message: summary,
    });

    return { skipped: false, supportCase: serializeSupportCase(saved), audit: auditPayload };
}

/**
 * PI-4F-6 — Align stale proactive case metadata before scan investigation (system path, no transition guard).
 */
export async function realignProactiveCaseMetadata(companyId, caseId, finding = {}) {
    const existing = await caseService.get(companyId, caseId);
    if (!existing) {
        throw Object.assign(new Error("Support case not found"), { status: 404, code: "NOT_FOUND" });
    }

    const ruleId = finding.ruleId || existing.diagnosis?.proactiveDetection?.ruleId;
    const updates = {
        lastActivityAt: new Date().toISOString(),
        lastActivitySummary: "Proactive case metadata realigned for scan investigation",
    };

    if (finding.category) {
        updates.category = assertCategory(finding.category);
    }
    if (finding.severity) {
        updates.severity = String(finding.severity).toLowerCase();
        updates.priority = assertPriority(priorityFromSeverity(updates.severity));
    }

    if (ruleId === "whatsapp_setup_incomplete") {
        updates.category = assertCategory("integrations");
        updates.severity = "low";
        updates.priority = assertPriority("low");
        const credEsc =
            existing.escalation?.ruleId === "credentials_or_security" ||
            String(existing.escalation?.reason || "").toLowerCase().includes("credential");
        if (credEsc || existing.status === "escalated") {
            updates.status = "investigating";
            updates.escalation = null;
        }
    }

    const saved = await caseService.update(companyId, caseId, updates);
    return serializeSupportCase(saved);
}

/** PI-4F-6 — Persist proactive scan investigation audit on the support case. */
export async function recordProactiveScanInvestigationAudit(companyId, caseId, auditPayload) {
    await activityService.create(companyId, {
        type: "proactive_scan_investigation",
        caseId,
        actorUserId: "proactive-detection",
        message: `Proactive scan: ${auditPayload.dedupeResult || "investigate"} rule=${auditPayload.findingRule}`,
        audit: auditPayload,
    });

    const existing = await caseService.get(companyId, caseId);
    if (!existing) return null;

    const pd = existing.diagnosis?.proactiveDetection || {};
    const saved = await caseService.update(companyId, caseId, {
        diagnosis: {
            ...(existing.diagnosis || {}),
            proactiveDetection: {
                ...pd,
                lastScanAudit: auditPayload,
            },
        },
        lastActivityAt: new Date().toISOString(),
    });
    return serializeSupportCase(saved);
}
