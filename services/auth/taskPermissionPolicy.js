/**
 * Tenant task authorization — SEC-03 (viewer assigned-only, role matrix).
 */
import { hasPermission, normalizeRole } from "./permissionsService.js";
import { isSuperAdminRole } from "./authService.js";

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
]);

/** Must never be overridden by portal/API PATCH bodies. */
export const TASK_PATCH_PROTECTED_KEYS = new Set([
    "id",
    "companyId",
    "createdByUid",
    "createdAt",
    "updatedAt",
    "complete",
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
 * @param {string|null|undefined} role
 * @param {string|null|undefined} uid
 * @param {object} body
 */
export function validateTaskCreateBody(role, uid, body = {}) {
    assertCanCreateTask(role);
    const assigneeUid = body.assigneeUid || body.assigneeId || null;
    if (assigneeUid && assigneeUid !== uid && !hasPermission(role, "canAssignTasks")) {
        throw httpError("Permission denied: canAssignTasks required to assign others", 403, "PERMISSION_DENIED");
    }
}

/**
 * @param {object|null|undefined} task
 * @param {object} patch
 */
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
