import { getPlatformAnalyticsOverview } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformAnalyticsOverview",
    description:
        "Mission Control only: platform analytics overview — tenant census, integration health, deployed AI employee counts (sampled), and billing partials. Use for platform usage and growth questions at operator level.",
    parameters: {
        type: "object",
        properties: {},
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute() {
        const data = await getPlatformAnalyticsOverview();
        const deployed = data.deployed || {};
        const message =
            `Platform analytics (${data.generatedAt}): ${data.overview?.total ?? "—"} tenants in census. ` +
            `Sampled ${deployed.sampledTenants ?? 0} tenants: ${deployed.aiEmployees ?? 0} AI employees deployed, ` +
            `${deployed.knowledgeBaseTenants ?? 0} tenants with knowledge docs` +
            (deployed.partial ? " (partial sample)." : ".");

        return {
            message,
            data,
            completionType: "read",
        };
    },
};
