import { resolveMcNavTarget, MC_NAV_PAGE_IDS } from "../mcNavigation.js";

export default {
    name: "navigateMissionControl",
    description:
        "Mission Control only: navigate the operator to a Mission Control page (Dashboard, Companies, CRM, Sarah, Billing, ZiricAI Analytics, Support Inbox, Integrations, AI Employees, Knowledge, Settings). Use when the operator asks to open, go to, or show a console page. Optional companyId to set tenant scope (e.g. open Companies for Client 0.1). Does not change tenant data.",
    parameters: {
        type: "object",
        properties: {
            page: {
                type: "string",
                description: `Mission Control page id: ${MC_NAV_PAGE_IDS.join(", ")}`,
            },
            companyId: {
                type: "string",
                description:
                    "Optional tenant company id to select in the scope dropdown when navigating (e.g. client-0-1).",
            },
        },
        required: ["page"],
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args) {
        const target = resolveMcNavTarget(args.page);
        if (!target) {
            return {
                success: false,
                message: `I don't recognize Mission Control page "${args.page}". Try dashboard, companies, billing, integrations, or sarah.`,
                completionType: "guidance",
            };
        }

        const companyId = args.companyId ? String(args.companyId).trim() : null;

        return {
            message: `I've taken you to ${target.label}.`,
            data: { page: target.page, label: target.label, companyId },
            uiHints: [
                {
                    navigateMc: target.page,
                    label: target.label,
                    ...(companyId ? { companyId } : {}),
                },
            ],
            completionType: "navigation",
            userFacingTruth: `Opened Mission Control navigation to ${target.label}; no tenant settings were changed.`,
        };
    },
};
