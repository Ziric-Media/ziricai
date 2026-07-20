import { listCustomers, listLeads } from "../../tenants/crmService.js";

export default {
    name: "searchCRM",
    description: "Search CRM for customers, contacts, or leads by name, phone, or keyword.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Search term — name, phone, or keyword" },
            type: {
                type: "string",
                enum: ["all", "customers", "leads"],
                description: "Record type to search",
            },
        },
        required: ["query"],
    },
    requiredPermissions: ["canViewInbox"],
    async execute(ctx, args) {
        const query = String(args.query || "").toLowerCase().trim();
        const type = args.type || "all";

        const results = { customers: [], leads: [] };

        if (type === "all" || type === "customers") {
            const customers = await listCustomers({ companyId: ctx.companyId });
            results.customers = (customers || [])
                .filter((c) => {
                    const hay = `${c.name || ""} ${c.phone || ""} ${c.email || ""}`.toLowerCase();
                    return !query || hay.includes(query);
                })
                .slice(0, 10);
        }

        if (type === "all" || type === "leads") {
            const leads = await listLeads(ctx.companyId, { max: 50 }).catch(() => []);
            results.leads = (leads || [])
                .filter((l) => {
                    const hay = `${l.name || ""} ${l.phone || ""} ${l.intent || ""}`.toLowerCase();
                    return !query || hay.includes(query);
                })
                .slice(0, 10);
        }

        const total = results.customers.length + results.leads.length;
        return {
            message: total
                ? `CRM search "${args.query}" returned ${total} result(s).`
                : `No CRM records matched "${args.query}".`,
            data: results,
            uiHints: [{ navigate: "customers" }],
        };
    },
};
