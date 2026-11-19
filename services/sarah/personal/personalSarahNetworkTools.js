/**
 * Personal Sarah ↔ Sarah Network — Discover listings + delegated Company Sarah chat.
 */
import { searchDiscoverCompanies, listDiscoverCards } from "../../users/businessDirectoryService.js";
import { sendCompanySarahMessage } from "../company/companyReceptionChatService.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../../storage/centralMotorsPilot.js";
import { EDUCARE_COMPANY_ID } from "../../education/educareDefaults.js";

const ALIASES = Object.freeze({
    "central motors": CENTRAL_MOTORS_RTB_COMPANY_ID,
    centralmotors: CENTRAL_MOTORS_RTB_COMPANY_ID,
    "central-motors": CENTRAL_MOTORS_RTB_COMPANY_ID,
    educare: EDUCARE_COMPANY_ID,
    "educare christian": EDUCARE_COMPANY_ID,
    "educare christian combined": EDUCARE_COMPANY_ID,
});

/**
 * @param {{ companyId?: string, companyName?: string }} args
 */
export async function resolveNetworkCompanyId(args = {}) {
    const direct = String(args.companyId || "").trim();
    if (direct) return direct;
    const name = String(args.companyName || "").trim().toLowerCase();
    if (!name) return null;
    if (ALIASES[name]) return ALIASES[name];
    for (const [key, id] of Object.entries(ALIASES)) {
        if (name.includes(key)) return id;
    }
    const category = normalizeDiscoverCategory(args.category);
    const { companies } = await searchDiscoverCompanies({
        q: args.companyName || name,
        category,
        limit: 8,
    });
    if (!companies?.length) {
        const cards = await listDiscoverCards();
        const hit = cards.find((c) => String(c.displayName || "").toLowerCase().includes(name));
        return hit?.companyId || null;
    }
    return companies[0].companyId || null;
}

function normalizeDiscoverCategory(raw) {
    const c = String(raw || "").toLowerCase().trim();
    if (!c || c === "all") return "";
    if (c === "school" || c === "schools") return "education";
    return c;
}

export const PERSONAL_SARAH_NETWORK_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "listSarahNetworkOrganisations",
            description:
                "List businesses and organisations on Sarah Network (Discover). Use for schools on the network, dealerships, clinics, etc. Returns companyId, name, category, and location.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Optional search text e.g. Educare, Oasis, Central Motors" },
                    category: {
                        type: "string",
                        description: "Optional filter: education (schools), auto, health, professional, community, food, fitness, market",
                    },
                    limit: { type: "number", description: "Max results (default 15, max 30)" },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "askCompanySarahOnNetwork",
            description:
                "Ask a listed organisation's Company Sarah on the user's behalf (Sarah-to-Sarah). Use for admissions, stock, hours, fees, test drives — then summarize for the user and suggest practical next steps.",
            parameters: {
                type: "object",
                properties: {
                    companyId: { type: "string", description: "companyId from listSarahNetworkOrganisations" },
                    companyName: {
                        type: "string",
                        description: "Resolve by name if companyId unknown e.g. Educare, Central Motors",
                    },
                    question: {
                        type: "string",
                        description: "Clear question for Company Sarah — include child's grade, dates, or product needs when relevant",
                    },
                },
                required: ["question"],
            },
        },
    },
];

/**
 * @param {string} toolName
 * @param {object} ctx personal context (uid, consumerProfile, preferredName, ...)
 * @param {object} args
 */
export async function executePersonalSarahNetworkTool(toolName, ctx, args = {}) {
    if (toolName === "listSarahNetworkOrganisations") {
        try {
            const limit = Math.min(30, Math.max(1, Number(args.limit) || 15));
            const category = normalizeDiscoverCategory(args.category);
            const { companies, total } = await searchDiscoverCompanies({
                q: String(args.query || "").trim(),
                category,
                limit,
            });
            const lines = (companies || []).map((c) => {
                const cats = (c.categories || []).join(", ") || "general";
                const place = [c.city, c.region].filter(Boolean).join(", ");
                return `• ${c.displayName || c.companyId} (id: ${c.companyId}) — ${cats}${place ? ` — ${place}` : ""}`;
            });
            const header =
                category === "education"
                    ? "Schools and education organisations on Sarah Network:"
                    : "Organisations on Sarah Network:";
            const message = lines.length
                ? `${header}\n${lines.join("\n")}\n\n${total} match in Discover. I can ask any listed Company's Sarah for details.`
                : "No Sarah Network listings matched that search yet. Try a different name or category, or check Discover in the app.";
            return {
                success: true,
                tool: toolName,
                message,
                data: { organisations: companies || [], total: total ?? lines.length },
            };
        } catch (err) {
            return { success: false, tool: toolName, error: err.message || "Could not load Sarah Network" };
        }
    }

    if (toolName === "askCompanySarahOnNetwork") {
        const question = String(args.question || "").trim();
        if (!question) {
            return { success: false, tool: toolName, error: "question is required" };
        }
        try {
            const companyId = await resolveNetworkCompanyId(args);
            if (!companyId) {
                return {
                    success: false,
                    tool: toolName,
                    error: "Could not find that organisation on Sarah Network. Call listSarahNetworkOrganisations first or use the exact companyId.",
                };
            }
            const userLabel = ctx.preferredName || ctx.firstName || "the customer";
            const delegated = `[Personal Sarah assisting ${userLabel}] ${question}`;
            const profile = ctx.consumerProfile || {};
            const result = await sendCompanySarahMessage(ctx.uid, companyId, delegated, profile);
            const companyReply =
                result.reply ||
                (result.messages || []).filter((m) => m.role === "assistant").slice(-1)[0]?.content ||
                "";
            if (!companyReply && result.humanActive) {
                return {
                    success: true,
                    tool: toolName,
                    message:
                        "That business has a human handling chats right now. I've opened the thread — check Chats for their reply, or try again shortly.",
                    data: { companyId, conversationId: result.conversationId },
                };
            }
            return {
                success: true,
                tool: toolName,
                message: companyReply || "Company Sarah replied without text (check Chats for attachments).",
                data: {
                    companyId,
                    companyName: result.companyName,
                    conversationId: result.conversationId,
                    companySarahReply: companyReply,
                },
            };
        } catch (err) {
            return {
                success: false,
                tool: toolName,
                error: err.message || "Could not reach Company Sarah",
            };
        }
    }

    return { success: false, tool: toolName, error: `Unknown network tool: ${toolName}` };
}