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