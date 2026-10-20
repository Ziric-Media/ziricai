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
        "Navigate the user to a Company Portal page. Explain where things live in your reply first. Only set takeUserThere true when the user explicitly asks to open/go/take them to that page in this message. Does not change data.",
    parameters: {
        type: "object",
        properties: {
            page: {
                type: "string",
                description:
                    "Portal page id: sarah, conversations (Sales), finance, operations, hr, integrations, agents, knowledge, customers, billing, automation, analytics, team, settings, support, dashboard, marketplace, appointments, activity, notifications",
            },
            takeUserThere: {
                type: "boolean",
                description:
                    "True only if the user explicitly asked to be taken/open/navigate to that page now. False when answering informational questions (describe the module, then offer to take them if they want).",
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

        const takeUserThere = args.takeUserThere === true;
        if (takeUserThere) {
            return {
                message: `Opening ${target.label} now.`,
                data: { page: target.page, label: target.label },
                uiHints: [{ navigate: target.page }],
                completionType: "navigation",
                userFacingTruth: `Opened navigation to ${target.label}; no settings were changed.`,
            };
        }

        return {
            message: `${target.label} is in the portal sidebar (${target.page}). I can answer questions here — say "take me to ${target.label}" when you want me to open it.`,
            data: { page: target.page, label: target.label },
            completionType: "guidance",
            userFacingTruth: `Described where ${target.label} lives; did not navigate automatically.`,
        };
    },
};
