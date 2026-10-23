import { getPlatformSupportAttention } from "../../operations/platformMissionControlService.js";
import { ATTENTION_QUEUES } from "../../support/attentionQueueClassification.js";

export default {
    name: "viewPlatformSupportAttention",
    description:
        "Mission Control Attention Centre: 🔴 requires_attention, 🟡 sarah_monitoring, 🟢 resolved. Use for operator exception management — what needs human attention, why, monitoring, recurring problems.",
    parameters: {
        type: "object",
        properties: {
            period: { type: "string", enum: ["day", "week", "month"] },
            date: { type: "string" },
            queue: {
                type: "string",
                enum: ["requires_attention", "sarah_monitoring", "resolved"],
                description: "Filter to one queue (omit for all)",
            },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args) {
        const data = await getPlatformSupportAttention({
            period: args.period || "day",
            date: args.date,
            queue: args.queue,
        });
        if (data.error) {
            return { success: false, message: data.error, data };
        }

        const red = data.counts?.requiresAttention ?? 0;
        const yellow = data.counts?.sarahMonitoring ?? 0;
        const green = data.counts?.resolved ?? 0;
        const cat = data.requiresAttentionCategories || {};

        let message =
            `Attention Centre: 🔴 ${red} require your attention, 🟡 ${yellow} Sarah monitoring, 🟢 ${green} resolved.`;
        if (args.queue === ATTENTION_QUEUES.REQUIRES_ATTENTION && red > 0) {
            const lines = (data.queues?.requires_attention || [])
                .slice(0, 8)
                .map((i) => `- ${i.companyName}: ${i.issue} (${i.attentionReason})`);
            message = `🔴 ${red} item(s) require your attention:\n${lines.join("\n")}`;
        }

        if (args.queue === ATTENTION_QUEUES.REQUIRES_ATTENTION && cat.credentials) {
            message += `\nCredentials/Meta: ${cat.credentials}; repeated failures: ${cat.repeated_failure || 0}.`;
        }

        return {
            message,
            data,
            completionType: "read",
        };
    },
};
