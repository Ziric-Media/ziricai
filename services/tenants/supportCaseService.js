/**
 * MC-U-4C — Tenant-scoped SupportCase (authoritative store).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { toIsoTimestamp } from "../core/timestampUtils.js";
import { normalizeRole } from "../auth/authService.js";
import { publish, EventTypes } from "../events/index.js";

export const SUPPORT_CASE_STATUSES = ["open", "assigned", "waiting", "resolved"];
export const SUPPORT_CASE_PRIORITIES = ["low", "medium", "high"];
export const SUPPORT_CASE_SOURCES = ["portal", "sarah", "conversation", "email", "system", "operator"];
export const SUPPORT_CASE_CATEGORIES = [
    "general",
    "billing",
    "integrations",
    "ai_employee",
    "knowledge",
    "marketplace",
    "account",
    "other",
];

const PATCH_ROLES = new Set(["owner", "manager", "support"]);

const ALLOWED_TRANSITIONS = {
    open: new Set(["assigned", "waiting", "resolved"]),
    assigned: new Set(["waiting", "resolved", "open"]),
    waiting: new Set(["assigned", "resolved"]),
    resolved: new Set(),
};

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
    const payload = {
        subject,
        description: input.description ? String(input.description).trim() : null,
        category: assertCategory(input.category),
        priority: assertPriority(input.priority),
        status: "open",
        source: assertSource(input.source),
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
