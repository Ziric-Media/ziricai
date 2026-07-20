import { getTenantMetrics } from "../../analytics/tenantAnalyticsService.js";
import { getPortalAnalytics } from "../../portal/portalDemo.js";

export default {
    name: "viewAnalytics",
    description:
        "View company analytics — conversation volume, response times, lead conversion, and usage metrics.",
    parameters: {
        type: "object",
        properties: {
            period: {
                type: "string",
                enum: ["7d", "30d", "90d"],
                description: "Time period for analytics",
            },
        },
    },
    requiredPermissions: ["canExportData"],
    async execute(ctx, args) {
        const period = args.period || "30d";
        let portal = null;
        try {
            portal = getPortalAnalytics(ctx.companyId);
        } catch {
            portal = null;
        }
        const metrics = await getTenantMetrics(ctx.companyId);

        const summary = portal?.summary || metrics;
        return {
            message: `Analytics for ${ctx.companyName} (${period}): ${JSON.stringify(summary, null, 0).slice(0, 400)}`,
            data: { period, metrics, portal: portal || metrics },
            uiHints: [{ navigate: "analytics" }],
        };
    },
};
