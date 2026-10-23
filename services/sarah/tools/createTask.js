import { createTaskForAccess } from "../../tenants/taskService.js";
import {
    requireSarahTenantContext,
    sarahTaskAccess,
    summarizeTaskForSarah,
} from "./taskToolCommon.js";

export default {
    name: "createTask",
    description:
        "Create a new task in the Operations Centre for this company. Only owners and managers may create tasks; assignee rules follow the same policy as the portal. Confirm success only after the task is persisted.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "Short task title (required)" },
            description: { type: "string", description: "Optional details" },
            priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "Priority (default medium)",
            },
            dueAt: { type: "string", description: "Optional due date/time (ISO or human-readable)" },
            assigneeUid: {
                type: "string",
                description: "Optional Firebase UID of assignee (owners/managers only)",
            },
            notes: { type: "string", description: "Optional notes" },
        },
        required: ["title"],
    },
    requiredPermissions: ["canCreateTasks"],
    async execute(ctx, args) {
        const companyId = requireSarahTenantContext(ctx);
        const title = String(args.title || "").trim();
        if (!title) {
            throw Object.assign(new Error("Task title is required."), {
                code: "VALIDATION_ERROR",
                status: 400,
            });
        }

        const access = sarahTaskAccess(ctx);
        const body = {
            title,
            description: args.description,
            priority: args.priority,
            dueAt: args.dueAt,
            assigneeUid: args.assigneeUid,
            notes: args.notes,
        };

        const task = await createTaskForAccess(companyId, access, body);
        const summary = summarizeTaskForSarah(task);

        return {
            message: `Created task "${summary.title}" (id ${summary.id}).`,
            data: { task: summary, companyId },
            uiHints: [{ navigate: "operations" }],
            userFacingTruth: `Task "${summary.title}" was saved in Operations for this workspace.`,
        };
    },
};
