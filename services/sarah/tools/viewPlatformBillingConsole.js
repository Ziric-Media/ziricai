import { getPlatformBillingConsole } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformBillingConsole",
    description:
        "Mission Control only: read-only billing console — which ZiricAI client companies are on which plans/packages, trial status, and MRR rollups. Use for “what plans are our clients on?”, trials, past due accounts.",
    parameters: {
        type: "object",
        properties: {},
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute() {
        const data = await getPlatformBillingConsole();
        const totals = data.totals || {};
        const byPkg = totals.byPackage || {};
        const packageSummary = Object.entries(byPkg)
            .map(([pkg, count]) => `${pkg}: ${count}`)
            .join(", ");
        const message =
            `Billing console (${data.generatedAt}): ${totals.totalAccounts ?? 0} accounts — ` +
            `${totals.trialAccounts ?? 0} trial, ${totals.activePaid ?? 0} active paid, ${totals.pastDue ?? 0} attention. ` +
            (packageSummary ? `By package: ${packageSummary}.` : "Package breakdown in tool data.");

        return {
            message,
            data: {
                generatedAt: data.generatedAt,
                totals: data.totals,
                rows: data.rows,
                meta: data.meta,
            },
            completionType: "read",
        };
    },
};
