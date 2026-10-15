/**
 * Tenant task authorization — SEC-03 (viewer assigned-only, role matrix).
 */
import { hasPermission, normalizeRole } from "./permissionsService.js";
import { isSuperAdminRole } from "./authService.js";
import { normalizeTaskDueAt } from "./taskDueAt.js";

export const TASK_STATUSES = new Set(["open", "in_progress", "done"]);
export const TASK_ASSIGNEE_TYPES = new Set(["human", "ai"]);
export const TASK_EXECUTION_STATUSES = new Set([
    "assigned",
    "queued",
    "in_progress",
    "completed",
    "failed",
]);

/** Client PATCH keys allowed through updateTaskForAccess (server-managed fields rejected). */
export const TASK_CLIENT_MUTABLE_PATCH_KEYS = new Set([
    "title",
    "description",
    "status",
    "priority",
    "dueAt",
    "assigneeUid",
    "assigneeId",
    "notes",
    "assigneeType",
    "aiEmployeeId",
    "aiInstructions",
]);

/** Must never be overridden by portal/API PATCH bodies. */
export const TASK_PATCH_PROTECTED_KEYS = new Set([
    "id",
    "companyId",
    "createdByUid",
    "createdAt",
    "updatedAt",
    "complete",
    "executionStatus",
    "executionQueuedAt",
    "executionStartedAt",
    "executionCompletedAt",
    "executionResult",
    "executionError",
    "executionJobId",
    "executionAttempts",
    "executionRetryAt",
    "activityLog",
]);

/** Client POST keys allowed through createTaskForAccess (OPEN-CREATE). */
export const TASK_CLIENT_CREATABLE_KEYS = new Set([
    "title",
    "description",
    "priority",
    "dueAt",
    "status",
    "assigneeUid",
    "assigneeId",
    "notes",
    "assigneeType",
    "aiEmployeeId",
    "aiInstructions",
]);

/** Must never be supplied on task create bodies. */
export const TASK_CREATE_PROTECTED_KEYS = new Set([
    ...TASK_PATCH_PROTECTED_KEYS,
    "completedAt",
    "executionStatus",
    "executionStartedAt",
    "executionCompletedAt",
    "executionError",
]);

export const TASK_PERMISSION_KEYS = [
    "canViewTasks",
    "canCreateTasks",
    "canAssignTasks",
    "canUpdateOwnTasks",
    "canUpdateAnyTask",
    "canCompleteTasks",
];

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

/** @param {object|null|undefined} task */
export function taskAssigneeUid(task) {
    if (!task) return null;
    return task.assigneeUid || task.assigneeId || task.assignedTo || null;
}

/** Viewer sees only tasks assigned to them (ADR-005). */
export function mustFilterTasksToAssigneeOnly(role) {
    return normalizeRole(role) === "viewer";
}

/**
 * Repository list options for role-scoped task queries.
 * @param {string|null|undefined} role
 * @param {string|null|undefined} uid
 */
export function listTaskQueryOptions(role, uid) {
    if (!hasPermission(role, "canViewTasks")) {
        throw httpError("Permission denied: canViewTasks required", 403, "PERMISSION_DENIED");
    }
    if (mustFilterTasksToAssigneeOnly(role)) {
        if (!uid) {
            throw httpError("Authentication required", 401, "UNAUTHORIZED");
        }
        return { filters: { assigneeUid: uid } };
    }
    return {};
}

/**
 * Defense-in-depth filter after list (legacy docs without assigneeUid).
 * @param {object[]} items
 */
export function enforceTaskListVisibility(items, role, uid) {
    if (!mustFilterTasksToAssigneeOnly(role)) return items;
    if (!uid) return [];
    return items.filter((task) => taskAssigneeUid(task) === uid);
}

export function assertCanViewTask(role, task, uid) {
    if (isSuperAdminRole(role)) return;
    if (!hasPermission(role, "canViewTasks")) {
        throw httpError("Permission denied: canViewTasks required", 403, "PERMISSION_DENIED");
    }
    if (mustFilterTasksToAssigneeOnly(role)) {
        if (taskAssigneeUid(task) !== uid) {
            throw httpError("Task not assigned to you", 403, "TASK_FORBIDDEN");
        }
    }
}

export function assertCanCreateTask(role) {
    if (isSuperAdminRole(role)) return;
    if (!hasPermission(role, "canCreateTasks")) {
        throw httpError("Permission denied: canCreateTasks required", 403, "PERMISSION_DENIED");
    }
}

/**
 * Allowlist + normalize client task CREATE before role checks and persistence.
 * @param {object} body
 * @returns {object} sanitized creatable fields (assigneeId → assigneeUid)
 */
export function sanitizeTaskCreateBody(body = {}) {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        throw httpError("Task create body must be an object", 400, "TASK_CREATE_INVALID");
    }
    for (const key of Object.keys(body)) {
        if (TASK_CREATE_PROTECTED_KEYS.has(key)) {
            throw httpError(`Protected task field cannot be set on create: ${key}`, 403, "TASK_CREATE_FORBIDDEN");
        }
        if (!TASK_CLIENT_CREATABLE_KEYS.has(key)) {
            throw httpError(`Unknown task create field: ${key}`, 400, "TASK_CREATE_UNKNOWN_FIELD");
        }
    }
    const out = {};
    for (const key of TASK_CLIENT_CREATABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            out[key] = body[key];
        }
    }
    if (out.assigneeId !== undefined && out.assigneeUid === undefined) {
        out.assigneeUid = out.assigneeId;
        delete out.assigneeId;
    } else if (out.assigneeId !== undefined) {
        delete out.assigneeId;
    }
    if (out.dueAt !== undefined) {
        out.dueAt = normalizeTaskDueAt(out.dueAt);
    }
    if (out.assigneeType === undefined || out.assigneeType === "") {
        out.assigneeType = out.aiEmployeeId ? "ai" : "human";
    }
    return out;
}

/**
 * @param {string|null|undefined} role
 * @param {string|null|undefined} uid
 * @param {object} body — sanitized creatable fields from sanitizeTaskCreateBody
 */
export function validateTaskCreateBody(role, uid, body = {}) {
    assertCanCreateTask(role);
    const assigneeType = body.assigneeType || "human";
    if (!TASK_ASSIGNEE_TYPES.has(assigneeType)) {
        throw httpError("Invalid assigneeType", 400, "TASK_CREATE_INVALID");
    }
    if (body.status !== undefined && !TASK_STATUSES.has(body.status)) {
        throw httpError("Invalid task status", 400, "TASK_CREATE_INVALID");
    }
    if (body.status === "done") {
        throw httpError("New tasks cannot be created as completed", 400, "TASK_CREATE_INVALID");
    }

    if (assigneeType === "ai") {
        if (!body.aiEmployeeId) {
            throw httpError("aiEmployeeId required for AI assignment", 400, "TASK_CREATE_INVALID");
        }
        if (!hasPermission(role, "canAssignTasks")) {
            throw httpError("Permission denied: canAssignTasks required for AI assignment", 403, "PERMISSION_DENIED");
        }
        if (body.assigneeUid) {
            throw httpError("Human assigneeUid cannot be set on AI tasks", 400, "TASK_CREATE_INVALID");
        }
        return;
    }

    const assigneeUid = body.assigneeUid || null;
    if (assigneeUid && assigneeUid !== uid && !hasPermission(role, "canAssignTasks")) {
        throw httpError("Permission denied: canAssignTasks required to assign others", 403, "PERMISSION_DENIED");
    }
}

/**
 * Allowlist + normalize client task PATCH before role checks and persistence.
 * @param {object} patch
 * @returns {object} sanitized patch (assigneeId → assigneeUid when needed)
 */
export function sanitizeTaskUpdatePatch(patch = {}) {
    if (patch == null || typeof patch !== "object" || Array.isArray(patch)) {
        throw httpError("Task patch must be an object", 400, "TASK_PATCH_INVALID");
    }
    for (const key of Object.keys(patch)) {
        if (TASK_PATCH_PROTECTED_KEYS.has(key)) {
            throw httpError(`Protected task field cannot be patched: ${key}`, 403, "TASK_PATCH_FORBIDDEN");
        }
        if (!TASK_CLIENT_MUTABLE_PATCH_KEYS.has(key)) {
            throw httpError(`Unknown task patch field: ${key}`, 400, "TASK_PATCH_UNKNOWN_FIELD");
        }
    }
    const out = {};
    for (const key of TASK_CLIENT_MUTABLE_PATCH_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            out[key] = patch[key];
        }
    }
    if (out.assigneeId !== undefined && out.assigneeUid === undefined) {
        out.assigneeUid = out.assigneeId;
        delete out.assigneeId;
    } else if (out.assigneeId !== undefined) {
        delete out.assigneeId;
    }
    if (out.dueAt !== undefined) {
        out.dueAt = normalizeTaskDueAt(out.dueAt);
    }
    if (patch.status !== undefined && !TASK_STATUSES.has(patch.status)) {
        throw httpError("Invalid task status", 400, "TASK_PATCH_INVALID");
    }
    return out;
}

export function assertCanUpdateTask(role, task, uid, patch = {}) {
    if (isSuperAdminRole(role)) return;
    if (!task) {
        throw httpError("Task not found", 404, "TASK_NOT_FOUND");
    }
    assertCanViewTask(role, task, uid);

    const assignee = taskAssigneeUid(task);
    const isOwn = assignee && uid && assignee === uid;
    const completing =
        patch.status === "done" ||
        patch.completedAt != null ||
        patch.complete === true;
    if (patch.assigneeType === "ai" || patch.aiEmployeeId !== undefined) {
        if (!hasPermission(role, "canAssignTasks")) {
            throw httpError("Permission denied: canAssignTasks required", 403, "PERMISSION_DENIED");
        }
    }

    if (patch.assigneeUid !== undefined || patch.assigneeId !== undefined) {
        const nextAssignee = patch.assigneeUid ?? patch.assigneeId;
        if (nextAssignee && nextAssignee !== assignee && !hasPermission(role, "canAssignTasks")) {
            throw httpError("Permission denied: canAssignTasks required", 403, "PERMISSION_DENIED");
        }
    }

    if (hasPermission(role, "canUpdateAnyTask")) {
        if (completing && !hasPermission(role, "canCompleteTasks")) {
            throw httpError("Permission denied: canCompleteTasks required", 403, "PERMISSION_DENIED");
        }
        return;
    }

    if (!isOwn) {
        throw httpError("Permission denied: canUpdateAnyTask or assigned task required", 403, "PERMISSION_DENIED");
    }

    if (!hasPermission(role, "canUpdateOwnTasks")) {
        throw httpError("Permission denied: canUpdateOwnTasks required", 403, "PERMISSION_DENIED");
    }

    if (completing && !hasPermission(role, "canCompleteTasks")) {
        throw httpError("Permission denied: canCompleteTasks required", 403, "PERMISSION_DENIED");
    }
}
