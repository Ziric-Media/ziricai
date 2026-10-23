import { getPlatformExecutiveOverview } from "../../operations/platformMissionControlService.js";

export default {
    name: "viewPlatformExecutiveOverview",
    description:
        "Mission Control only: platform-wide executive snapshot — how many client companies (tenants), census by classification, WhatsApp integration counts, billing/trial summary, and operational KPIs. Use for “how many clients do we have?”, platform health, tenant census.",
    parameters: {
        type: "object",
        properties: {},
    },
    platformOnly: true,
    requiredPermissions: [],
    async execute() {
        const data = await getPlatformExecutiveOverview();
        const census = data.tenantCensus || {};
        const wa = data.integrations?.whatsapp || {};
        const tenants = data.tenants || {};
        const message =
            `Platform overview (${data.generatedAt}): ${census.total ?? tenants.total ?? 0} tenant companies ` +
            `(production ${census.productionCustomer ?? 0}, pilot ${census.pilot ?? 0}, acceptance ${census.acceptance ?? 0}, ` +
            `demo/showcase ${census.demoShowcase ?? 0}, test ${census.test ?? 0}). ` +
            `WhatsApp across tenants: ${wa.connected ?? 0} connected, ${wa.pending ?? 0} pending, ${wa.error ?? 0} error, ` +
            `${wa.not_connected ?? 0} not connected. ` +
            `Billing sample: ${tenants.trial ?? 0} trial, ${tenants.paying ?? 0} paying, ${tenants.pastDue ?? 0} past due` +
            (data.billing?.partial ? " (billing partial sample)." : ".");

        return {
            message,
            data,
            completionType: "read",
            userFacingTruth: "Counts come from live platform read APIs, not estimates.",
        };
    },
};
