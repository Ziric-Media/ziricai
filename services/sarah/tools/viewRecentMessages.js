import { gatherRecentMessageActivity } from "../../support/diagnostics/gatherTenantDiagnostics.js";
import { can } from "../permissions.js";

export default {
    name: "viewRecentMessages",
    description:
        "Read-only sample of recent WhatsApp conversations to verify inbound/outbound activity (requires inbox permission).",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Sample size (default 15, max 25)" },
        },
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args) {
        if (!can(ctx.role || "viewer", "canViewInbox")) {
            return {
                success: false,
                code: "PERMISSION_DENIED",
                message: "You need inbox access to view recent messages.",
                completionType: "guidance",
            };
        }
        const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 25);
        const data = await gatherRecentMessageActivity(ctx.companyId, { limit });
        const message = data.recentActivityDetected
            ? `Recent WhatsApp activity detected (${data.whatsappConversations} conversation sample).`
            : "No recent WhatsApp message activity detected in the sample.";
        return { message, data, completionType: "read_only" };
    },
};
