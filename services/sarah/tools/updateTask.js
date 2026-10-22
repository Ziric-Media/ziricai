import { getTaskForAccess, updateTaskForAccess } from "../../tenants/taskService.js";
import { normalizeTaskDueAt } from "../../auth/taskDueAt.js";
import { TASK_CLIENT_MUTABLE_PATCH_KEYS } from "../../auth/taskPermissionPolicy.js";
import {
    requireSarahTenantContext,
    sarahTaskAccess,
    summarizeTaskForSarah,
} from "./taskToolCommon.js";

const PATCH_PROPERTIES = {
    title: { type: "string", description: "Updated title" },
    description: { type: "string", description: "Updated description or instructions" },
    status: {
        type: "string",
        enum: ["open", "in_progress", "done"],
        description: "Task status",
    },
    priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Priority",
    },
    dueAt: { type: "string", description: "Due date/time (ISO or human-readable)" },
    assigneeUid: { type: "string", description: "Firebase UID of human assignee (managers/owners)" },
    notes: { type: "string", description: "Notes — use for recorded blockers or follow-ups" },
};

export default {
    name: "updateTask",
    description:
        "Update an existing Operations task by id. Only supported fields are applied; permissions match the portal. Confirm success only after the backend persists the change.",
    parameters: {
        type: "object",
        properties: {
            taskId: { type: "string", description: "Task id (required)" },
            ...PATCH_PROPERTIES,
        },
        required: ["taskId"],
    },
    requiredPermissions: ["canViewTasks"],
    async execute(ctx, args = {}) {
        const companyId = requireSarahTenantContext(ctx);
        const taskId = String(args.taskId || "").trim();
        if (!taskId) {
            throw Object.assign(new Error("taskId is required."), {
                code: "VALIDATION_ERROR",
                status: 400,
            });
        }

        const access = sarahTaskAccess(ctx);
        const existing = await getTaskForAccess(companyId, taskId, access);
        if (!existing) {
            throw Object.assign(new Error("Task not found or not visible in this workspace."), {
                code: "TASK_NOT_FOUND",
                status: 404,
            });
        }

        const patch = {};
        for (const key of TASK_CLIENT_MUTABLE_PATCH_KEYS) {
            if (Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined) {
                patch[key] = args[key];
            }
        }
        if (Object.keys(patch).length === 0) {
            throw Object.assign(new Error("No supported update fields were provided."), {
                code: "VALIDATION_ERROR",
                status: 400,
            });
        }
        if (patch.dueAt !== undefined && patch.dueAt !== null && patch.dueAt !== "") {
            patch.dueAt = normalizeTaskDueAt(patch.dueAt);
        }

        const updated = await updateTaskForAccess(companyId, taskId, access, patch);
        if (!updated) {
            throw Object.assign(new Error("Task update failed."), {
                code: "TASK_UPDATE_FAILED",
                status: 500,
            });
        }

        const summary = summarizeTaskForSarah(updated);
        return {
            message: `Updated task "${summary.title}" (id ${summary.id}, status ${summary.status}).`,
            data: { task: summary, companyId },
            uiHints: [{ navigate: "operations" }],
            userFacingTruth: `Task "${summary.title}" was updated in Operations.`,
        };
    },
};
