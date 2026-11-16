/**
 * US-02 P1 — Sarah credit estimator (shadow metering).
 * @see docs/architecture/SARAH_APP_US01_COGS_AND_TIER_ALLOWANCES.md
 */
import { getCatalogueSku, getEntitlementTemplate } from "./catalogueService.js";

export const SARAH_CREDIT_UNIT_ZAR = 0.01;
export const USD_TO_ZAR_PLANNING = 18.5;

const MODEL_RATES_ZAR_PER_1M = {
    "gpt-4o-mini": { input: 0.15 * USD_TO_ZAR_PLANNING, output: 0.6 * USD_TO_ZAR_PLANNING },
    "gpt-4o": { input: 2.5 * USD_TO_ZAR_PLANNING, output: 10 * USD_TO_ZAR_PLANNING },
};

/** Draft archetype debits — docs COGS §5 */
export const SARAH_CREDIT_ARCHETYPE_DEFAULTS = {
    "CHAT-TURN": 4,
    "CHAT-TOOL": 2,
    "WORK-STEP": 6,
    "WORK-SUBMIT": 7,
    "DOC-SMALL": 15,
    DEMO: 4,
};

/** Draft monthly included credits — docs COGS §8.1 (sign-off pending) */
export const SARAH_MONTHLY_CREDITS_BY_TIER = {
    free: 250,
    plus: 2800,
    premium: 5500,
    ultimate: 11000,
};

function resolveModelRates(model) {
    const id = String(model || "gpt-4o-mini").toLowerCase();
    if (id.includes("4o") && !id.includes("mini")) return MODEL_RATES_ZAR_PER_1M["gpt-4o"];
    return MODEL_RATES_ZAR_PER_1M["gpt-4o-mini"];
}

/**
 * @param {{
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   model?: string,
 *   toolRounds?: number,
 *   archetype?: string,
 * }} input
 * @returns {{ credits: number, creditsMicro: number, providerCostZar: number, archetype: string }}
 */
export function estimateSarahCredits(input = {}) {
    const archetype = String(input.archetype || "").trim().toUpperCase();
    if (archetype && SARAH_CREDIT_ARCHETYPE_DEFAULTS[archetype] != null) {
        const credits = SARAH_CREDIT_ARCHETYPE_DEFAULTS[archetype];
        return {
            credits,
            creditsMicro: credits * 100,
            providerCostZar: credits * SARAH_CREDIT_UNIT_ZAR,
            archetype,
        };
    }

    const inputTokens = Math.max(0, Number(input.inputTokens) || 0);
    const outputTokens = Math.max(0, Number(input.outputTokens) || 0);
    const toolRounds = Math.max(0, Number(input.toolRounds) || 0);
    const rates = resolveModelRates(input.model);

    let providerCostZar =
        (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
    providerCostZar += toolRounds * 2 * SARAH_CREDIT_UNIT_ZAR;

    if (inputTokens + outputTokens === 0) {
        const credits = SARAH_CREDIT_ARCHETYPE_DEFAULTS.DEMO;
        return {
            credits,
            creditsMicro: credits * 100,
            providerCostZar: credits * SARAH_CREDIT_UNIT_ZAR,
            archetype: "DEMO",
        };
    }

    const credits = Math.max(1, Math.ceil(providerCostZar / SARAH_CREDIT_UNIT_ZAR));
    return {
        credits,
        creditsMicro: credits * 100,
        providerCostZar,
        archetype: toolRounds > 0 ? "CHAT-TOOL" : "CHAT-TURN",
    };
}

export function monthlyCreditsForSkuId(skuId) {
    const id = String(skuId || "rs02.sarah.free.zar.monthly");
    const sku = getCatalogueSku(id);
    const tpl = sku?.entitlementTemplateId ? getEntitlementTemplate(sku.entitlementTemplateId) : null;
    const n = Number(tpl?.sarahLimits?.monthlyCredits);
    if (Number.isFinite(n) && n > 0) return n;
    if (id.includes(".ultimate.")) return SARAH_MONTHLY_CREDITS_BY_TIER.ultimate;
    if (id.includes(".premium.")) return SARAH_MONTHLY_CREDITS_BY_TIER.premium;
    if (id.includes(".plus.")) return SARAH_MONTHLY_CREDITS_BY_TIER.plus;
    return SARAH_MONTHLY_CREDITS_BY_TIER.free;
}