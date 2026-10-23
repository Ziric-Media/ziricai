import { getPortalActivityAsync } from "../../portal/portalDemo.js";
import { can } from "../permissions.js";

export default {
    name: "viewRecentActivity",
    description:
        "Read recent workspace activity log entries for this company (owner/manager). Use for “what happened recently in my workspace?”",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max entries (default 10)" },
        },
    },
    requiredPermissions: ["canManageStaff"],
    async execute(ctx, args) {
        const role = ctx.role || "viewer";
        if (!can(role, "canManageStaff")) {
            return {
                success: false,
                code: "PERMISSION_DENIED",
                message:
                    "Activity log is restricted to owners and managers. You can still ask about AI employees, knowledge, or integrations if your role allows.",
                completionType: "guidance",
            };
        }

        const limit = Math.min(Number(args.limit) || 10, 25);
        const items = (await getPortalActivityAsync(ctx.companyId).catch(() => [])).slice(0, limit);

        if (!items.length) {
            return {
                message: "No recent activity entries recorded for this workspace yet.",
                data: { count: 0, items: [] },
                uiHints: [{ navigate: "activity" }],
                completionType: "read_only",
            };
        }

        const summary = items
            .slice(0, 5)
            .map((a) => a.summary || a.message || a.type || "Activity")
            .join("; ");

        return {
            message: `Recent activity (${items.length} entries): ${summary}`,
            data: { count: items.length, items },
            uiHints: [{ navigate: "activity" }],
            completionType: "read_only",
        };
    },
};
