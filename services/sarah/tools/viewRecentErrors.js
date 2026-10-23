import { gatherRecentErrors } from "../../support/diagnostics/gatherTenantDiagnostics.js";

export default {
    name: "viewRecentErrors",
    description:
        "Read-only recent integration and processing errors for this workspace (WhatsApp integration, queue failures, portal activity).",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max errors to return (default 10)" },
        },
    },
    requiredPermissions: ["canManageIntegrations"],
    async execute(ctx, args) {
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
        const data = await gatherRecentErrors(ctx.companyId, { limit });
        const message =
            data.count === 0
                ? "No recent errors were detected in read-only checks."
                : `Found ${data.count} recent error signal(s).`;
        return { message, data, completionType: "read_only" };
    },
};
