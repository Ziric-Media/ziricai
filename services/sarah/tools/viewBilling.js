import { getCompanyPlan, getAllPlans } from "../../payments/billingService.js";
import { getPortalUsage } from "../../portal/portalDemo.js";

export default {
    name: "viewBilling",
    description: "View billing plan, usage limits, and subscription details for the company.",
    parameters: {
        type: "object",
        properties: {},
    },
    requiredPermissions: ["canViewBilling"],
    async execute(ctx) {
        const plan = await getCompanyPlan(ctx.companyId);
        let usage = null;
        try {
            usage = getPortalUsage(ctx.companyId);
        } catch {
            usage = null;
        }
        const plans = getAllPlans();

        return {
            message: `Current plan: ${plan?.name || plan?.id || "starter"}. Usage: ${JSON.stringify(usage?.usage || usage || {}).slice(0, 200)}`,
            data: { plan, usage, availablePlans: plans?.map((p) => ({ id: p.id, name: p.name, price: p.price })) },
            uiHints: [{ navigate: "billing" }],
        };
    },
};
