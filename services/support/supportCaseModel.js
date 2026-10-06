/**
 * PI-4F-1 — Support case + escalation domain model (Portal SoT, MC read-only).
 */

/** Primary lifecycle (PI-4F). */
export const SUPPORT_LIFECYCLE = {
    OPEN: "open",
    INVESTIGATING: "investigating",
    ESCALATED: "escalated",
    HUMAN_ACTION: "human_action",
    RESOLVED: "resolved",
};

/** Legacy v1 statuses (MC-U-4C) — normalized to lifecycle on read. */
export const SUPPORT_CASE_STATUSES = [
    "open",
    "assigned",
    "waiting",
    "investigating",
    "escalated",
    "human_action",
    "resolved",
];

export const SUPPORT_SEVERITY = {
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
};

/** @deprecated alias — use severity; priority kept for portal API compat */
export const SUPPORT_CASE_PRIORITIES = ["low", "medium", "high", "critical"];

export const SUPPORT_CASE_SOURCES = ["portal", "sarah", "conversation", "email", "system", "operator", "proactive"];

export const SUPPORT_CASE_CATEGORIES = [
    "general",
    "billing",
    "integrations",
    "ai_employee",
    "knowledge",
    "marketplace",
    "account",
    "security",
    "privacy",
    "other",
];

export const AFFECTED_SERVICES = [
    "whatsapp",
    "messenger",
    "email",
    "web_chat",
    "ai_employee",
    "knowledge",
    "billing",
    "platform",
    "other",
];

export const REMEDIATION_OUTCOMES = ["pending", "success", "failed", "skipped"];

export const ALLOWED_LIFECYCLE_TRANSITIONS = {
    open: new Set(["investigating", "escalated", "resolved", "assigned"]),
    investigating: new Set(["resolved", "escalated", "human_action"]),
    escalated: new Set(["human_action", "resolved"]),
    human_action: new Set(["resolved", "escalated"]),
    assigned: new Set(["waiting", "investigating", "resolved", "escalated"]),
    waiting: new Set(["assigned", "investigating", "resolved", "escalated"]),
    resolved: new Set(),
};

export function normalizeLifecycleStatus(status) {
    const s = String(status || "open").toLowerCase();
    if (s === "assigned" || s === "waiting") return SUPPORT_LIFECYCLE.INVESTIGATING;
    if (Object.values(SUPPORT_LIFECYCLE).includes(s)) return s;
    if (SUPPORT_CASE_STATUSES.includes(s)) return s;
    return SUPPORT_LIFECYCLE.OPEN;
}

export function severityFromPriority(priority) {
    const p = String(priority || "medium").toLowerCase();
    if (p === "critical") return SUPPORT_SEVERITY.CRITICAL;
    if (p === "high") return SUPPORT_SEVERITY.HIGH;
    if (p === "low") return SUPPORT_SEVERITY.LOW;
    return SUPPORT_SEVERITY.MEDIUM;
}

export function priorityFromSeverity(severity) {
    const s = String(severity || "medium").toLowerCase();
    if (SUPPORT_CASE_PRIORITIES.includes(s)) return s;
    return "medium";
}

/**
 * Platform / MC view — enriched, read-only shape.
 */
export function toPlatformSupportCaseView(companyId, record, companyName = null) {
    const lifecycle = normalizeLifecycleStatus(record.status);
    return {
        id: record.id,
        companyId,
        companyName: companyName || companyId,
        issue: record.issue || record.subject,
        subject: record.subject,
        description: record.description,
        category: record.category,
        severity: record.severity || severityFromPriority(record.priority),
        priority: record.priority,
        lifecycle,
        status: record.status,
        affectedService: record.affectedService || null,
        source: record.source,
        diagnosis: record.diagnosis || null,
        actionsAttempted: record.actionsAttempted || [],
        sarahConfidence: record.sarahConfidence ?? null,
        escalation: record.escalation || null,
        resolution: record.resolution || null,
        assigneeType: record.assigneeType,
        assigneeId: record.assigneeId,
        assigneeName: record.assigneeName,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        resolvedAt: record.resolvedAt,
        lastActivityAt: record.lastActivityAt,
        lastActivitySummary: record.lastActivitySummary,
        requiresOperatorAttention: lifecycle === "escalated" || lifecycle === "human_action",
    };
}
