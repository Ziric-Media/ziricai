/**
 * Entitlement engine (R0) — billing separate from effective limits/features.
 */
import { getTenantBilling } from "../payments/billingService.js";
import { checkPlanLimit } from "../platform/billingPlans.js";
import { getCatalogueSku, getEntitlementTemplate, getCatalogueVersionId } from "./catalogueService.js";
import { legacyPlanIdToSku, DEFAULT_CONSUMER_SKU } from "./legacyPlanAliases.js";
import { getEnforcementMode } from "./revenueConfig.js";

/**
 * @typedef {object} EntitlementSnapshot
 * @property {string} accountType
 * @property {string} accountId
 * @property {string} skuId
 * @property {string} status
 * @property {string} catalogueVersionId
 * @property {object} limits
 * @property {object} sarahLimits
 * @property {object} features
 * @property {string} enforcementMode
 * @property {string} computedAt
 */

/**
 * @returns {Promise<EntitlementSnapshot>}
 */
export async function getConsumerEntitlements(uid, options = {}) {
    const skuId = options.skuId || DEFAULT_CONSUMER_SKU;
    const sku = getCatalogueSku(skuId);
    const template = sku?.entitlementTemplateId
        ? getEntitlementTemplate(sku.entitlementTemplateId)
        : null;
    const enforcementMode = await getEnforcementMode("rs02Limits");

    return {
        accountType: "consumer",
        accountId: uid,
        skuId,
        status: skuId.includes(".free.") ? "free" : "active",
        catalogueVersionId: getCatalogueVersionId(),
        limits: {},
        sarahLimits: template?.sarahLimits || { dailyChats: 20, knowledgeBytes: 524288, premiumModels: false },
        features: template?.features || { discoverAccess: true, statusAccess: true },
        enforcementMode,
        computedAt: new Date().toISOString(),
    };
}

/**
 * @param {string} companyId
 * @param {object} [options]
 * @returns {Promise<EntitlementSnapshot>}
 */
export async function getCompanyEntitlements(companyId, options = {}) {
    let planId = options.planId;
    if (!planId) {
        const record = await getTenantBilling(companyId).catch(() => null);
        planId = record?.planId || "starter";
    }
    const skuId = legacyPlanIdToSku(planId);
    const sku = getCatalogueSku(skuId);
    const template = sku?.entitlementTemplateId
        ? getEntitlementTemplate(sku.entitlementTemplateId)
        : null;
    const enforcementMode = await getEnforcementMode("rs01Limits");

    return {
        accountType: "company",
        accountId: companyId,
        skuId,
        status: planId === "trial" ? "trialing" : "active",
        catalogueVersionId: getCatalogueVersionId(),
        limits: template?.limits || {},
        sarahLimits: {},
        features: template?.features || {},
        enforcementMode,
        computedAt: new Date().toISOString(),
    };
}

/**
 * Parity helper — same result as checkPlanLimit for AI employees when using legacy plan id.
 * @param {string} planId
 * @param {string} resource
 * @param {number} usage
 * @param {number} [increment]
 */
export function evaluateLegacyPlanLimit(planId, resource, usage, increment = 1) {
    return checkPlanLimit(planId, resource, usage, increment);
}

/**
 * @param {EntitlementSnapshot} snapshot
 * @param {string} resource
 * @param {number} usage
 * @param {number} [increment]
 */
export function wouldExceedCompanyLimit(snapshot, resource, usage, increment = 1) {
    const planId = snapshot.skuId.replace("rs01.company.", "").replace(".zar.monthly", "");
    return checkPlanLimit(planId, resource, usage, increment);
}
