import { listTenantConversations } from "../../tenants/conversationService.js";

export default {
    name: "viewConversations",
    description: "List recent live conversations and inbox status for the company.",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max conversations to return (default 10)" },
            status: {
                type: "string",
                enum: ["all", "open", "closed"],
                description: "Filter by conversation status",
            },
        },
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args) {
        const limit = Math.min(Number(args.limit) || 10, 25);
        const conversations = await listTenantConversations(ctx.companyId, { max: limit });

        const items = (conversations || []).slice(0, limit).map((c) => ({
            phone: c.phone || c.id,
            preview: c.lastMessage || c.preview || c.summary,
            channel: c.channel || "whatsapp",
            updatedAt: c.updatedAt || c.lastMessageAt,
        }));

        return {
            message: `Found ${items.length} recent conversation(s).`,
            data: { count: items.length, conversations: items },
            uiHints: [{ navigate: "conversations" }],
        };
    },
};
