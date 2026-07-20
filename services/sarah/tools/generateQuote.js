export default {
    name: "generateQuote",
    description: "Generate a sales quote for a product or service with pricing lines.",
    parameters: {
        type: "object",
        properties: {
            customerName: { type: "string", description: "Customer name" },
            items: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        description: { type: "string" },
                        amount: { type: "number" },
                    },
                },
                description: "Line items with description and amount in ZAR",
            },
            validDays: { type: "number", description: "Quote validity in days (default 7)" },
        },
        required: ["customerName", "items"],
    },
    requiredPermissions: ["canReply"],
    async execute(ctx, args) {
        const items = Array.isArray(args.items) ? args.items : [];
        const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        const quoteId = `Q-${ctx.companyId.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const validDays = Number(args.validDays) || 7;

        const quote = {
            id: quoteId,
            companyId: ctx.companyId,
            customerName: args.customerName,
            items,
            total,
            currency: "ZAR",
            validUntil: new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10),
            status: "draft",
        };

        return {
            message: `Quote ${quoteId} for ${args.customerName}: R${total.toLocaleString("en-ZA")} (valid ${validDays} days).`,
            data: { quote },
            uiHints: [{ navigate: "customers" }],
        };
    },
};
