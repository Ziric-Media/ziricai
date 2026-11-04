/**
 * Maps legacy company planId (billingPlans.js) to RMS skuId.
 */
export const LEGACY_COMPANY_PLAN_TO_SKU = {
    trial: "rs01.company.trial.zar.monthly",
    starter: "rs01.company.starter.zar.monthly",
    professional: "rs01.company.professional.zar.monthly",
    business: "rs01.company.business.zar.monthly",
    enterprise: "rs01.company.enterprise.zar.monthly",
};

export const DEFAULT_CONSUMER_SKU = "rs02.sarah.free.zar.monthly";

/**
 * @param {string} [planId]
 * @returns {string}
 */
export function legacyPlanIdToSku(planId) {
    if (!planId) return LEGACY_COMPANY_PLAN_TO_SKU.starter;
    return LEGACY_COMPANY_PLAN_TO_SKU[planId] || `rs01.company.${planId}.zar.monthly`;
}
