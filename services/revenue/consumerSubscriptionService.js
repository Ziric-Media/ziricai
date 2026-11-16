/**
 * RS02 — consumer subscription record (sku + billing period). Checkout is self-serve when enabled.
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { getCatalogueSku, getEntitlementTemplate } from "./catalogueService.js";
import { DEFAULT_CONSUMER_SKU } from "./legacyPlanAliases.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_SUBSCRIPTIONS);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function docId(uid) {
    return `csub_${uid}`;
}

function periodForMonthly(now = new Date()) {
    const start = new Date(now);
    const end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

/** @param {string} uid */
export async function getConsumerSubscription(uid) {
    if (!uid) return null;
    const row = await col.get(docId(uid));
    if (!row) {
        return {
            uid,
            skuId: DEFAULT_CONSUMER_SKU,
            status: "free",
            ...periodForMonthly(),
        };
    }
    return row;
}

/**
 * @param {string} uid
 * @param {string} skuId
 */
export async function applyConsumerCheckout(uid, skuId, extra = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const sku = getCatalogueSku(String(skuId || "").trim());
    if (!sku || !sku.accountTypes?.includes("consumer") || !sku.public) {
        throw err(422, "SKU_INVALID", "Choose a valid Sarah plan.");
    }
    const period = periodForMonthly();
    const row = {
        uid,
        skuId: sku.skuId,
        productId: sku.productId,
        status: sku.amountCents > 0 ? "active" : "free",
        amountCents: sku.amountCents,
        currency: sku.currency || "ZAR",
        billingPeriod: sku.billingPeriod || "monthly",
        ...period,
        paymentProvider: extra.paymentProvider || null,
        paymentReference: extra.paymentReference || null,
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    await col.put(docId(uid), row, { merge: false });
    const template = sku.entitlementTemplateId ? getEntitlementTemplate(sku.entitlementTemplateId) : null;
    return {
        subscription: row,
        entitlement: template?.sarahLimits || null,
    };
}

export function clearConsumerSubscriptionsForTests() {
    col.clearMemory();
}
