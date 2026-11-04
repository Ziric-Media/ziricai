/**
 * Unified product & pricing catalogue (R0) — in-memory seed from billingPlans + RS02–RS08 placeholders.
 */
import { BILLING_PLANS, getPlan } from "../platform/billingPlans.js";

const CATALOGUE_VERSION_ID = "seed-r0-v1";

/** @type {Map<string, object>} */
const skuById = new Map();
/** @type {Map<string, object>} */
const templateById = new Map();

function centsFromPrice(price) {
    return Math.round(Number(price || 0) * 100);
}

function registerCompanyPlans() {
    for (const plan of Object.values(BILLING_PLANS)) {
        const skuId = `rs01.company.${plan.id}.zar.monthly`;
        const templateId = `ent.company.${plan.id}`;
        const limits = plan.limits || {};
        templateById.set(templateId, {
            templateId,
            accountType: "company",
            limits: { ...limits },
            features: {
                statusPublish: true,
                discoverListing: true,
            },
        });
        skuById.set(skuId, {
            skuId,
            productId: `rs01.company.${plan.id}`,
            revenueStreamId: "RS01",
            name: plan.label,
            description: plan.description || plan.tagline || "",
            accountTypes: ["company"],
            currency: plan.currency || "ZAR",
            amountCents: centsFromPrice(plan.price),
            billingPeriod: plan.billingCycle || "monthly",
            trialDays: plan.trialDays || null,
            entitlementTemplateId: templateId,
            public: plan.id !== "trial",
        });
    }
}

function registerSarahPlans() {
    const sarahTiers = [
        { id: "free", name: "Sarah Free", price: 0, dailyChats: 20, knowledgeBytes: 512 * 1024 },
        { id: "plus", name: "Sarah Plus", price: 99, dailyChats: 100, knowledgeBytes: 5 * 1024 * 1024 },
        { id: "premium", name: "Sarah Premium", price: 199, dailyChats: 300, knowledgeBytes: 20 * 1024 * 1024 },
        { id: "ultimate", name: "Sarah Ultimate", price: 399, dailyChats: 1000, knowledgeBytes: 100 * 1024 * 1024 },
    ];
    for (const tier of sarahTiers) {
        const skuId = `rs02.sarah.${tier.id}.zar.monthly`;
        const templateId = `ent.sarah.${tier.id}`;
        templateById.set(templateId, {
            templateId,
            accountType: "consumer",
            sarahLimits: {
                dailyChats: tier.dailyChats,
                knowledgeBytes: tier.knowledgeBytes,
                premiumModels: tier.id !== "free",
            },
            features: {
                discoverAccess: true,
                statusAccess: true,
            },
        });
        skuById.set(skuId, {
            skuId,
            productId: `rs02.sarah.${tier.id}`,
            revenueStreamId: "RS02",
            name: tier.name,
            accountTypes: ["consumer"],
            currency: "ZAR",
            amountCents: centsFromPrice(tier.price),
            billingPeriod: "monthly",
            entitlementTemplateId: templateId,
            public: true,
        });
    }
}

function registerPlaceholderSkus() {
    const placeholders = [
        { skuId: "rs03.status.boost.starter.zar", revenueStreamId: "RS03", name: "Starter Boost", amountCents: 5000 },
        { skuId: "rs04.discover.featured.basic.zar.monthly", revenueStreamId: "RS04", name: "Featured Basic", amountCents: 19900 },
        { skuId: "rs06.credits.consumer.500.zar", revenueStreamId: "RS06", name: "500 AI Credits", amountCents: 9900 },
        { skuId: "rs07.addon.whatsapp_business.zar.monthly", revenueStreamId: "RS07", name: "WhatsApp Business Add-on", amountCents: 29900 },
        { skuId: "rs08.service.standard_onboarding.zar", revenueStreamId: "RS08", name: "Standard onboarding", amountCents: 250000 },
    ];
    for (const p of placeholders) {
        skuById.set(p.skuId, {
            ...p,
            productId: p.skuId.split(".").slice(0, 3).join("."),
            accountTypes: p.revenueStreamId === "RS02" || p.skuId.includes("consumer") ? ["consumer"] : ["company"],
            currency: "ZAR",
            billingPeriod: p.skuId.includes("monthly") ? "monthly" : "once",
            entitlementTemplateId: null,
            public: false,
        });
    }
}

let initialized = false;

function ensureCatalogue() {
    if (initialized) return;
    registerCompanyPlans();
    registerSarahPlans();
    registerPlaceholderSkus();
    initialized = true;
}

export function getCatalogueVersionId() {
    return CATALOGUE_VERSION_ID;
}

/**
 * @param {boolean} [publicOnly]
 */
export function listCatalogueSkus(publicOnly = false) {
    ensureCatalogue();
    const items = [...skuById.values()];
    return publicOnly ? items.filter((s) => s.public) : items;
}

/**
 * @param {string} skuId
 */
export function getCatalogueSku(skuId) {
    ensureCatalogue();
    return skuById.get(skuId) || null;
}

/**
 * @param {string} templateId
 */
export function getEntitlementTemplate(templateId) {
    ensureCatalogue();
    return templateById.get(templateId) || null;
}

/**
 * Resolve legacy plan for limit parity checks.
 * @param {string} planId
 */
export function getLegacyPlanDefinition(planId) {
    return getPlan(planId);
}
