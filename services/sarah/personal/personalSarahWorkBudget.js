/**
 * SW-02 — automatic Sarah Work assignment budgeting (no user sliders).
 * @see docs/architecture/SARAH_APP_US01_COGS_AND_TIER_ALLOWANCES.md §6
 */
import { computeConsumerCreditBalances } from "../../revenue/consumerSarahCreditMeter.js";
import { estimateSarahCredits } from "../../revenue/sarahCreditEstimator.js";

/** @type {Record<string, { pct: number, abs: number, estMin: number, estMax: number, label: string }>} */
export const WORK_BAND_POLICY = {
    S: { pct: 0.15, abs: 40, estMin: 15, estMax: 40, label: "Quick task" },
    M: { pct: 0.35, abs: 250, estMin: 80, estMax: 250, label: "Standard assignment" },
    L: { pct: 0.5, abs: 900, estMin: 300, estMax: 900, label: "Deep assignment" },
};

function userTextFromSession(session) {
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    return msgs
        .filter((m) => m.role === "user")
        .map((m) => String(m.content || "").trim())
        .filter(Boolean)
        .join("\n");
}

/**
 * @param {object} session
 * @returns {"S"|"M"|"L"}
 */
export function assessWorkBand(session) {
    const text = userTextFromSession(session);
    const len = text.length;
    const userTurns = (session?.messages || []).filter((m) => m.role === "user").length;
    const lower = text.toLowerCase();
    const deep =
        /\b(research|report|compare|analyse|analyze|comprehensive|detailed|multi|spreadsheet|document)\b/.test(lower);
    const longPaste = len > 1200;
    if (longPaste || deep && len > 400) return "L";
    if (deep || len > 280 || userTurns >= 4) return "M";
    return "S";
}

/**
 * @param {number} remainingCredits
 * @param {"S"|"M"|"L"} band
 */
export function capCreditsForBand(remainingCredits, band) {
    const policy = WORK_BAND_POLICY[band] || WORK_BAND_POLICY.S;
    const remain = Math.max(0, Number(remainingCredits) || 0);
    const share = Math.floor(remain * policy.pct);
    return Math.max(6, Math.min(policy.abs, share || policy.estMin));
}

/**
 * @param {object} session
 * @param {{ monthlyRemainingCredits?: number, topUpBalanceCredits?: number, availableCredits?: number }} [balances]
 */
export function buildWorkBudgetPlan(session, balances = {}) {
    const band = assessWorkBand(session);
    const policy = WORK_BAND_POLICY[band];
    const remaining =
        Number(balances.availableCredits) ||
        Number(balances.monthlyRemainingCredits || 0) + Number(balances.topUpBalanceCredits || 0);
    const capCredits = capCreditsForBand(remaining, band);
    const submitEst = estimateSarahCredits({ archetype: "WORK-SUBMIT" });
    const stepEst = estimateSarahCredits({ archetype: "WORK-STEP" });
    return {
        band,
        bandLabel: policy.label,
        estimateRange: { min: policy.estMin, max: policy.estMax },
        capCredits,
        remainingCredits: remaining,
        submitCredits: submitEst.credits,
        stepCredits: stepEst.credits,
        disclaimer: "Sarah manages credits automatically within your remaining balance.",
    };
}

/**
 * @param {string} uid
 * @param {object} session
 */
export async function allocateWorkBudgetForSession(uid, session) {
    const balances = await computeConsumerCreditBalances(uid);
    const plan = buildWorkBudgetPlan(session, {
        monthlyRemainingCredits: balances.monthlyRemainingMicro / 100,
        topUpBalanceCredits: balances.topUpMicro / 100,
        availableCredits: balances.availableMicro / 100,
    });
    return { ...plan, balances };
}

/**
 * @param {object} session
 * @param {number} additionalCredits
 */
export function wouldExceedWorkCap(session, additionalCredits = 0) {
    const cap = Number(session?.workBudgetCapCredits);
    if (!Number.isFinite(cap) || cap <= 0) return false;
    const used = Number(session?.workCreditsUsedCredits) || 0;
    return used + additionalCredits > cap;
}