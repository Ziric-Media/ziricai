/**
 * Task service — tenant-scoped tasks (distinct from customer-embedded tasks).
 * HTTP/API must use listTasksForAccess, getTaskForAccess, createTaskForAccess, updateTaskForAccess (SEC-03/04).
 * Direct createTask/listTasks/getTask/updateTask are for automation/system callers only.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    listTaskQueryOptions,
    enforceTaskListVisibility,
    assertCanViewTask,
    validateTaskCreateBody,
    assertCanUpdateTask,
    sanitizeTaskUpdatePatch,
} from "../auth/taskPermissionPolicy.js";

class TaskService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.TASKS);
    }

    async listOpen(companyId, max = 100) {
        return this.list(companyId, {
            max,
            filters: { status: "open" },
            orderByField: "dueAt",
            orderDirection: "asc",
        });
    }
}

const taskService = new TaskService();

export async function listTasks(companyId, options = {}) {
    return taskService.list(companyId, options);
}

export async function getTask(companyId, taskId) {
    return taskService.get(companyId, taskId);
}

/**
 * List/get tasks with SEC-03 role policy (viewer assignee filter + direct lookup guard).
 * @param {string} companyId
 * @param {{ role?: string|null, uid?: string|null, listOptions?: object }} access
 */
export async function listTasksForAccess(companyId, access = {}) {
    const queryOpts = listTaskQueryOptions(access.role, access.uid);
    const merged = { ...queryOpts, ...(access.listOptions || {}) };
    const items = await listTasks(companyId, merged);
    return enforceTaskListVisibility(items, access.role, access.uid);
}

export async function getTaskForAccess(companyId, taskId, access = {}) {
    const task = await getTask(companyId, taskId);
    if (!task) return null;
    assertCanViewTask(access.role, task, access.uid);
    return task;
}

export async function createTaskForAccess(companyId, access, data = {}) {
    validateTaskCreateBody(access.role, access.uid, data);
    const assigneeUid = data.assigneeUid ?? data.assigneeId ?? null;
    return createTask(companyId, {
        ...data,
        assigneeUid,
        createdByUid: access.uid || null,
    });
}

export async function updateTaskForAccess(companyId, taskId, access, patch = {}) {
    const existing = await getTask(companyId, taskId);
    if (!existing) return null;
    const sanitized = sanitizeTaskUpdatePatch(patch);
    assertCanUpdateTask(access.role, existing, access.uid, sanitized);
    return updateTask(companyId, taskId, sanitized);
}

export async function createTask(companyId, data) {
    return taskService.create(companyId, {
        status: "open",
        priority: "medium",
        ...data,
    });
}

export async function updateTask(companyId, taskId, patch) {
    return taskService.update(companyId, taskId, patch);
}

export async function completeTask(companyId, taskId) {
    return taskService.update(companyId, taskId, {
        status: "done",
        completedAt: new Date().toISOString(),
    });
}

export async function listOpenTasks(companyId) {
    return taskService.listOpen(companyId);
}
