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
    sanitizeTaskCreateBody,
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
    const sanitized = sanitizeTaskCreateBody(data);
    validateTaskCreateBody(access.role, access.uid, sanitized);
    const assigneeType = sanitized.assigneeType || "human";
    const payload = {
        title: sanitized.title ?? "",
        description: sanitized.description ?? "",
        priority: sanitized.priority ?? "medium",
        dueAt: sanitized.dueAt ?? null,
        notes: sanitized.notes ?? "",
        assigneeUid: assigneeType === "human" ? sanitized.assigneeUid ?? null : null,
        assigneeType,
        aiEmployeeId: assigneeType === "ai" ? sanitized.aiEmployeeId ?? null : null,
        aiInstructions: sanitized.aiInstructions ?? "",
        status: sanitized.status || "open",
        createdByUid: access.uid ?? null,
    };
    if (assigneeType === "ai") {
        const { getAiEmployee } = await import("./aiEmployeeService.js");
        const agent = await getAiEmployee(companyId, payload.aiEmployeeId);
        if (!agent) {
            throw Object.assign(new Error("AI employee not found in this workspace"), {
                status: 404,
                code: "AI_EMPLOYEE_NOT_FOUND",
            });
        }
        payload.executionStatus = "queued";
        payload.executionQueuedAt = new Date().toISOString();
        payload.activityLog = [
            {
                type: "task_created",
                message: `AI task created for ${agent.name || agent.id} and queued for execution.`,
                at: new Date().toISOString(),
                jobId: null,
            },
        ];
    }
    const task = await createTask(companyId, payload);
    if (assigneeType === "ai" && task?.id) {
        const { enqueueAiTaskExecution } = await import("../operations/aiTaskQueue.js");
        await enqueueAiTaskExecution({
            companyId,
            taskId: task.id,
            createdByUid: access.uid ?? null,
        });
    }
    return task;
}

export async function updateTaskForAccess(companyId, taskId, access, patch = {}) {
    const existing = await getTask(companyId, taskId);
    if (!existing) return null;
    const sanitized = sanitizeTaskUpdatePatch(patch);
    assertCanUpdateTask(access.role, existing, access.uid, sanitized);
    if (sanitized.assigneeType === "ai" || sanitized.aiEmployeeId) {
        const nextAgentId = sanitized.aiEmployeeId ?? existing.aiEmployeeId;
        if (nextAgentId) {
            const { getAiEmployee } = await import("./aiEmployeeService.js");
            const agent = await getAiEmployee(companyId, nextAgentId);
            if (!agent) {
                throw Object.assign(new Error("AI employee not found in this workspace"), {
                    status: 404,
                    code: "AI_EMPLOYEE_NOT_FOUND",
                });
            }
        }
    }
    const updated = await updateTask(companyId, taskId, sanitized);
    const { appendTaskActivity } = await import("./taskActivity.js");
    if (sanitized.status && sanitized.status !== existing.status) {
        await appendTaskActivity(companyId, taskId, {
            type: "status_changed",
            message: `Task status changed to ${sanitized.status}.`,
        });
    }
    if (
        sanitized.assigneeUid !== undefined &&
        sanitized.assigneeUid !== (existing.assigneeUid || existing.assigneeId)
    ) {
        await appendTaskActivity(companyId, taskId, {
            type: "assignment_changed",
            message: sanitized.assigneeUid
                ? `Assigned to team member ${sanitized.assigneeUid}.`
                : "Human assignee cleared.",
        });
    }
    return updated;
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
