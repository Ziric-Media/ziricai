import { getPlatformSupportCases } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformSupportCases",
    description:
        "Mission Control only: read-only support case aggregation across the platform. Use for “what’s happening with support?”, open cases, operator inbox backlog.",
    parameters: {
        type: "object",
        properties: {},
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute() {
        const data = await getPlatformSupportCases();
        const counts = data.counts || {};
        const note = data.meta?.note || "";
        const message = data.meta?.unavailable
            ? `Support case feed is not connected yet. ${note}`.trim()
            : `Support cases (${data.generatedAt}): open ${counts.open ?? 0}, assigned ${counts.assigned ?? 0}, waiting ${counts.waiting ?? 0}, resolved ${counts.resolved ?? 0}.`;

        return {
            message,
            data,
            completionType: "read",
        };
    },
};
