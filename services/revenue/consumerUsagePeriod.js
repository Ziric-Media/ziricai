/**
 * Usage period keys: paid consumers use subscription period; free uses UTC day.
 */
import { DEFAULT_CONSUMER_SKU } from "./legacyPlanAliases.js";
import { getConsumerSubscription } from "./consumerSubscriptionService.js";

function utcDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

/**
 * Chat metering — daily bucket (even on paid plans).
 */
export function getConsumerChatDayKey() {
    return utcDayKey();
}

/**
 * Work + combined usage docs for paid plans — billing period bucket.
 * @param {string} uid
 */
export async function getConsumerWorkPeriodKey(uid) {
    const sub = uid ? await getConsumerSubscription(uid) : null;
    const skuId = sub?.skuId || DEFAULT_CONSUMER_SKU;
    if (skuId.includes(".free.")) {
        return utcDayKey();
    }
    const ps = String(sub?.periodStart || "").slice(0, 10);
    const pe = String(sub?.periodEnd || "").slice(0, 10);
    if (ps && pe) return `period_${ps}_${pe}`;
    return utcDayKey();
}

/**
 * US-02 — credit metering bucket: free = calendar month; paid = subscription period (same as Work).
 * @param {string} [uid]
 */
export async function getConsumerCreditPeriodKey(uid) {
    const sub = uid ? await getConsumerSubscription(uid) : null;
    const skuId = sub?.skuId || DEFAULT_CONSUMER_SKU;
    if (skuId.includes(".free.")) {
        return `month_${utcDayKey().slice(0, 7)}`;
    }
    return getConsumerWorkPeriodKey(uid);
}

/** Monthly work cap = daily allowance × days in period (ceil). */
export function workTaskLimitForPeriod(dailyLimit, sub) {
    const base = Math.max(0, Number(dailyLimit) || 0);
    if (!sub?.skuId || sub.skuId.includes(".free.")) return base;
    const start = Date.parse(sub.periodStart);
    const end = Date.parse(sub.periodEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return base * 30;
    const days = Math.max(1, Math.ceil((end - start) / 86400000));
    return base * days;
}
