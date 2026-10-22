import { listTasksForAccess } from "../../tenants/taskService.js";
import {
    requireSarahTenantContext,
    sarahTaskAccess,
    summarizeTaskForSarah,
} from "./taskToolCommon.js";

export default {
    name: "listTasks",
    description:
        "List workspace tasks from the Operations Centre for this company. Respects the signed-in user's role (viewers only see tasks assigned to them). Use when the user asks what tasks are open, their to-do list, or operations work items.",
    parameters: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["all", "open", "done"],
                description: "Filter by task status (default: all)",
            },
            limit: {
                type: "number",
                description: "Maximum tasks to return (default 25, max 50)",
            },
        },
    },
    requiredPermissions: ["canViewTasks"],
    async execute(ctx, args) {
        const companyId = requireSarahTenantContext(ctx);
        const access = sarahTaskAccess(ctx);
        const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);
        const statusFilter = args.status || "all";

        // Avoid Firestore composite indexes (status + updatedAt) — filter in memory after access-scoped list.
        const fetchMax = Math.min(Math.max(limit * 4, 50), 100);
        const items = await listTasksForAccess(companyId, {
            ...access,
            listOptions: { max: fetchMax },
        });
        let filtered = items || [];
        if (statusFilter === "open") {
            filtered = filtered.filter((t) => t.status !== "done");
        } else if (statusFilter === "done") {
            filtered = filtered.filter((t) => t.status === "done");
        }
        const tasks = filtered.slice(0, limit).map(summarizeTaskForSarah);

        const openCount = tasks.filter((t) => t.status !== "done").length;
        const doneCount = tasks.length - openCount;

        return {
            message:
                tasks.length === 0
                    ? "No tasks match that filter in Operations."
                    : `Found ${tasks.length} task(s) (${openCount} open, ${doneCount} done).`,
            data: { tasks, count: tasks.length, companyId },
            uiHints: [{ navigate: "operations" }],
        };
    },
};
