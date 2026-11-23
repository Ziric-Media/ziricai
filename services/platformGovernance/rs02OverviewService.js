/**
 * MC-PO-01 / MC-PO-08 — RS02 consumer subscription & payment rollups (read-only).
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { getCatalogueSku } from "../revenue/catalogueService.js";
import { DEFAULT_CONSUMER_SKU } from "../revenue/legacyPlanAliases.js";

const subsCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_SUBSCRIPTIONS);
const ledgerCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_PAYMENT_LEDGER);

const SCAN_CAP = 5000;

function tierFromSkuId(skuId) {
    const id = String(skuId || DEFAULT_CONSUMER_SKU);
    const m = id.match(/rs02\.sarah\.(\w+)\./i);
    return m ? m[1].toLowerCase() : "other";
}

function parsePeriodMs(period) {
    const map = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };
    const days = map[String(period || "30d").toLowerCase()] || 30;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    return { days, startMs: start.getTime(), startIso: start.toISOString() };
}

/**
 * @param {{ period?: string }} [opts]
 */
export async function getRs02PlatformOverview({ period = "30d" } = {}) {
    const { days, startMs, startIso } = parsePeriodMs(period);
    const subs = await subsCol.list({ limit: SCAN_CAP });
    const byTier = { free: 0, plus: 0, premium: 0, ultimate: 0, other: 0 };
    let paidActive = 0;
    let mrrEstimateCents = 0;

    for (const sub of subs) {
        const tier = tierFromSkuId(sub.skuId);
        if (byTier[tier] === undefined) byTier.other += 1;
        else byTier[tier] += 1;
        const active = String(sub.status || "").toLowerCase() === "active" && Number(sub.amountCents || 0) > 0;
        if (active) {
            paidActive += 1;
            const sku = getCatalogueSku(sub.skuId);
            mrrEstimateCents += Number(sku?.amountCents ?? sub.amountCents ?? 0);
        }
    }
    if (!subs.length) {
        byTier.free = 0;
    }

    const ledger = await ledgerCol.list({ limit: SCAN_CAP });
    let paymentsCapturedInPeriodCents = 0;
    let paymentsCountInPeriod = 0;
    let refundsInPeriod = 0;
    for (const row of ledger) {
        const t = new Date(row.completedAt || row.createdAt || 0).getTime();
        if (t < startMs) continue;
        if (row.status === "captured") {
            paymentsCountInPeriod += 1;
            paymentsCapturedInPeriodCents += Number(row.amountCents || 0);
        }
        if (row.status === "revoked" || row.revokedAt) refundsInPeriod += 1;
    }

    return {
        period: `${days}d`,
        periodStart: startIso,
        subscriptions: {
            byTier,
            paidActive,
            subscriptionsScanned: subs.length,
            scanCap: SCAN_CAP,
            partial: subs.length >= SCAN_CAP,
        },
        revenue: {
            currency: "ZAR",
            paymentsCapturedInPeriodCents,
            paymentsCountInPeriod,
            refundsInPeriod,
            mrrEstimateCents,
            mrrNote: "Estimate from active paid subscription SKUs; not audited financial reporting.",
        },
    };
}

export async function getRs02ConsoleRows({ limit = 100 } = {}) {
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const subs = await subsCol.list({ limit: cap });
    const rows = subs
        .map((sub) => ({
            uid: sub.uid,
            skuId: sub.skuId || DEFAULT_CONSUMER_SKU,
            tier: tierFromSkuId(sub.skuId),
            status: sub.status || "free",
            amountCents: Number(sub.amountCents || 0),
            periodEnd: sub.periodEnd || null,
            paymentProvider: sub.paymentProvider || null,
            updatedAt: sub.updatedAt || null,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { rows, partial: subs.length >= cap };
}

export function clearRs02OverviewForTests() {
    subsCol.clearMemory();
    ledgerCol.clearMemory();
}
