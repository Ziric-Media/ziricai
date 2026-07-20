/**
 * Task service — tenant-scoped tasks (distinct from customer-embedded tasks).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

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
