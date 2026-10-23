import { getPlatformSupportOperations } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformSupportOperations",
    description:
        "Mission Control read-only: Sarah support activity and remediation audit for a period — investigations, resolutions, escalations, remediation success rates, dimensional breakdowns, recent operational actions.",
    parameters: {
        type: "object",
        properties: {
            period: { type: "string", enum: ["day", "week", "month"], description: "Period grain" },
            date: { type: "string", description: "Anchor date YYYY-MM-DD (optional)" },
        },
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args) {
        const data = await getPlatformSupportOperations({
            period: args.period || "day",
            date: args.date,
        });
        if (data.error) {
            return { success: false, message: data.error, data };
        }
        const a = data.activity || {};
        const message =
            `Sarah support activity (${data.periodKey}): ${a.casesInvestigated ?? 0} investigated, ` +
            `${a.casesResolvedBySarah ?? 0} resolved by Sarah, ${a.remediationAttempts ?? 0} remediation attempts, ` +
            `${a.successfulRemediations ?? 0} verified successes, ${a.casesEscalated ?? 0} escalated.` +
            (a.remediationSuccessRatePercent != null
                ? ` Remediation success rate: ${a.remediationSuccessRatePercent}%.`
                : "");

        return {
            message,
            data,
            completionType: "read",
        };
    },
};
