/**
 * REC-04 — campaign presentation allowance accounting (debit in REC-08).
 */
import { campaignUsageCol } from "./recommendationStore.js";
import { billingPeriodKey } from "./campaignConstants.js";

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

export function usagePeriodId(campaignId, periodKey = billingPeriodKey()) {
    return `${campaignId}_${periodKey}`;
}

/**
 * @param {string} campaignId
 * @param {number} monthlyAllowance
 */
export async function ensureCampaignUsagePeriod(campaignId, monthlyAllowance) {
    const periodKey = billingPeriodKey();
    const periodId = usagePeriodId(campaignId, periodKey);
    const existing = await campaignUsageCol.get(periodId);
    if (existing) return strip(existing);
    const row = {
        periodId,
        campaignId,
        billingPeriodKey: periodKey,
        monthlyAllowance,
        usedPresentations: 0,
        remainingPresentations: monthlyAllowance,
        exhaustedAt: null,
        createdAt: new Date().toISOString(),
        lastEventAt: null,
    };
    await campaignUsageCol.put(periodId, row, { merge: false });
    return row;
}

export async function getCampaignUsage(campaignId) {
    const periodId = usagePeriodId(campaignId);
    const raw = await campaignUsageCol.get(periodId);
    return raw ? strip(raw) : null;
}

/**
 * Idempotent debit — returns { debited: false } when already consumed for this event key.
 * @param {string} campaignId
 * @param {string} idempotencyKey
 */
export async function consumePresentationAllowance(campaignId, idempotencyKey) {
    const periodId = usagePeriodId(campaignId);
    const raw = await campaignUsageCol.get(periodId);
    if (!raw) {
        return { debited: false, reason: "no_usage_period" };
    }
    const cur = strip(raw);
    const keys = new Set(cur.idempotencyKeys || []);
    if (keys.has(idempotencyKey)) {
        return { debited: false, duplicate: true, remainingPresentations: cur.remainingPresentations };
    }
    if (cur.remainingPresentations <= 0) {
        return { debited: false, reason: "exhausted", remainingPresentations: 0 };
    }
    const now = new Date().toISOString();
    const next = {
        ...cur,
        usedPresentations: cur.usedPresentations + 1,
        remainingPresentations: cur.remainingPresentations - 1,
        lastEventAt: now,
        idempotencyKeys: [...keys, idempotencyKey],
        exhaustedAt: cur.remainingPresentations - 1 <= 0 ? now : cur.exhaustedAt,
    };
    await campaignUsageCol.put(periodId, next, { merge: false });
    return { debited: true, remainingPresentations: next.remainingPresentations, exhausted: next.remainingPresentations <= 0 };
}