import { can } from "../permissions.js";
import { resolvePortalNavTarget } from "../portalNavigation.js";

const ALIASES = {
    inbox: "conversations",
    crm: "customers",
    "ai employees": "agents",
    employees: "agents",
    "knowledge base": "knowledge",
    whatsapp: "integrations",
    connectwhatsapp: "integrations",
};

export default {
    name: "navigatePortal",
    description:
        "Navigate the user to a Company Portal page (Integrations, AI Employees, Knowledge Base, Inbox, Billing, Automation, Support, etc.). Use when they ask where to do something — returns a UI navigation hint. Does not change data.",
    parameters: {
        type: "object",
        properties: {
            page: {
                type: "string",
                description:
                    "Portal page id: sarah, conversations (Sales), finance, operations, hr, integrations, agents, knowledge, customers, billing, automation, analytics, team, settings, support, dashboard, marketplace, appointments, activity, notifications",
            },
        },
        required: ["page"],
    },
    requiredPermissions: [],
    async execute(ctx, args) {
        let pageKey = String(args.page || "").trim().toLowerCase();
        pageKey = ALIASES[pageKey] || pageKey;
        const target = resolvePortalNavTarget(pageKey);

        if (!target) {
            return {
                success: false,
                message: `I don't recognize the page "${args.page}". Try integrations, agents, knowledge, conversations, or billing.`,
                completionType: "guidance",
            };
        }

        const role = ctx.role || "viewer";
        if (target.permission && !can(role, target.permission)) {
            return {
                success: false,
                code: "PERMISSION_DENIED",
                message: `You don't have permission to open ${target.label}. Required capability: ${target.permission}. Ask an owner or manager if you need access.`,
                completionType: "guidance",
            };
        }

        return {
            message: `I'll take you to ${target.label}.`,
            data: { page: target.page, label: target.label },
            uiHints: [{ navigate: target.page }],
            completionType: "navigation",
            userFacingTruth: `Opened navigation to ${target.label}; no settings were changed.`,
        };
    },
};
