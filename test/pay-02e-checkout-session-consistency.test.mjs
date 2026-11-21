/**
 * PAY-02E — checkout session repair when ledger is captured but session is pending.
 */
process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";
process.env.RS06_CREDITS_CHECKOUT = "true";
process.env.PAYSTACK_SECRET_KEY = "sk_test_pay02e_fake_key_abcdefghij";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../services/database/schema.js";
import { createNetworkCollection } from "../services/network/networkCollectionStore.js";
import { getCatalogueSku } from "../services/revenue/catalogueService.js";
import {
    initConsumerCheckout,
    verifyConsumerCheckout,
    handlePaystackCheckoutWebhook,
    clearConsumerCheckoutSessionsForTests,
    repairPendingCheckoutSessions,
} from "../services/revenue/consumerCheckoutPaymentService.js";
import { recordConsumerPayment, getConsumerPaymentByReference } from "../services/revenue/consumerPaymentLedger.js";
import {
    clearConsumerSubscriptionsForTests,
    getConsumerSubscription,
} from "../services/revenue/consumerSubscriptionService.js";
import {
    clearConsumerSarahCreditMeterForTests,
    getConsumerSarahCreditShadowSummary,
} from "../services/revenue/consumerSarahCreditMeter.js";
import { resetRevenueConfigCacheForTests } from "../services/revenue/revenueConfig.js";

const sessionCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_CHECKOUT_SESSIONS);
const RS02_SKU = "rs02.sarah.plus.zar.monthly";
const RS06_SKU = "rs06.credits.consumer.500.zar";
const rs02Sku = getCatalogueSku(RS02_SKU);
const rs06Sku = getCatalogueSku(RS06_SKU);
const uidRs02 = "pay02e-rs02";
const uidRs06 = "pay02e-rs06";
const email = "pay02e@example.com";

const originalFetch = globalThis.fetch;

function paystackMock(metaByRef) {
    globalThis.fetch = async (url, init) => {
        const u = String(url);
        if (u.includes("/transaction/initialize")) {
            const body = JSON.parse(init.body);
            metaByRef.set(body.reference, body.metadata || {});
            return {
                ok: true,
                json: async () => ({
                    status: true,
                    data: { authorization_url: "https://mock.paystack", reference: body.reference },
                }),
            };
        }
        if (u.includes("/transaction/verify/")) {
            const ref = decodeURIComponent(String(u).split("/").pop());
            const meta = metaByRef.get(ref) || {};
            const skuId = meta.skuId || RS02_SKU;
            const sku = getCatalogueSku(skuId);
            return {
                ok: true,
                json: async () => ({
                    status: true,
                    data: {
                        status: "success",
                        reference: ref,
                        amount: sku.amountCents,
                        currency: sku.currency || "ZAR",
                        metadata: meta,
                    },
                }),
            };
        }
        throw new Error(`unexpected fetch ${u}`);
    };
}

function paystackWebhook(bodyObj, secret = process.env.PAYSTACK_SECRET_KEY) {
    const body = JSON.stringify(bodyObj);
    const buf = Buffer.from(body);
    const sig = createHmac("sha512", secret).update(buf).digest("hex");
    return handlePaystackCheckoutWebhook(buf, sig);
}

async function seedCapturedLedger(reference, session, provider = "paystack") {
    await recordConsumerPayment({
        paymentReference: reference,
        uid: session.uid,
        skuId: session.skuId,
        amountCents: session.amountCents,
        currency: session.currency,
        provider,
        status: "captured",
        completedAt: new Date().toISOString(),
    });
}

function resetAll() {
    resetRevenueConfigCacheForTests();
    clearConsumerCheckoutSessionsForTests();
    clearConsumerSubscriptionsForTests();
    clearConsumerSarahCreditMeterForTests();
}

resetAll();
const metaByRef = new Map();
paystackMock(metaByRef);

// --- RS02: captured ledger + pending session repaired on browser verify ---
const started = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const pendingRow = await sessionCol.get(started.reference);
assert.equal(pendingRow.status, "pending");
await seedCapturedLedger(started.reference, pendingRow);
const repaired = await verifyConsumerCheckout(started.reference, uidRs02);
assert.equal(repaired.duplicate, true);
const sessionAfter = await sessionCol.get(started.reference);
assert.equal(sessionAfter.status, "completed");
assert.ok(sessionAfter.completedAt);
assert.equal(sessionAfter.paymentProvider, "paystack");
const ledgerRows = await getConsumerPaymentByReference(started.reference);
assert.equal(ledgerRows.status, "captured");

// --- RS02: browser-first happy path sets session completed ---
resetAll();
metaByRef.clear();
const browserFirst = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const first = await verifyConsumerCheckout(browserFirst.reference, uidRs02);
assert.equal(first.duplicate, false);
const browserSession = await sessionCol.get(browserFirst.reference);
assert.equal(browserSession.status, "completed");
const again = await verifyConsumerCheckout(browserFirst.reference, uidRs02);
assert.equal(again.duplicate, true);
assert.equal((await sessionCol.get(browserFirst.reference)).status, "completed");

// --- RS02: webhook-first ---
resetAll();
metaByRef.clear();
const whFirst = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const ev1 = await paystackWebhook({
    event: "charge.success",
    data: { id: "pay02e_wh1", reference: whFirst.reference },
});
assert.equal(ev1.handled, true);
const whSession = await sessionCol.get(whFirst.reference);
assert.equal(whSession.status, "completed");
const ev1Dup = await paystackWebhook({
    event: "charge.success",
    data: { id: "pay02e_wh1", reference: whFirst.reference },
});
assert.equal(ev1Dup.duplicate, true);
assert.equal((await sessionCol.get(whFirst.reference)).status, "completed");

// --- RS02: duplicate webhook repairs pending session when ledger already captured ---
resetAll();
metaByRef.clear();
const whRepair = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const whRow = await sessionCol.get(whRepair.reference);
await seedCapturedLedger(whRepair.reference, whRow);
const whEv = await paystackWebhook({
    event: "charge.success",
    data: { id: "pay02e_wh_repair", reference: whRepair.reference },
});
assert.equal(whEv.handled, true);
assert.equal((await sessionCol.get(whRepair.reference)).status, "completed");
const whEvDup = await paystackWebhook({
    event: "charge.success",
    data: { id: "pay02e_wh_repair", reference: whRepair.reference },
});
assert.equal(whEvDup.duplicate, true);
assert.equal((await getConsumerSubscription(uidRs02))?.paymentReference, undefined);

// --- RS02: concurrent duplicate verify (single ledger, session completed once) ---
resetAll();
metaByRef.clear();
const concurrent = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const cRow = await sessionCol.get(concurrent.reference);
await seedCapturedLedger(concurrent.reference, cRow);
const [a, b] = await Promise.all([
    verifyConsumerCheckout(concurrent.reference, uidRs02),
    verifyConsumerCheckout(concurrent.reference, uidRs02),
]);
assert.equal(a.duplicate, true);
assert.equal(b.duplicate, true);
assert.equal((await sessionCol.get(concurrent.reference)).status, "completed");

// --- RS02: ledger/session metadata mismatch blocks repair ---
resetAll();
metaByRef.clear();
const mismatch = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const mRow = await sessionCol.get(mismatch.reference);
await recordConsumerPayment({
    paymentReference: mismatch.reference,
    uid: mRow.uid,
    skuId: mRow.skuId,
    amountCents: mRow.amountCents + 1,
    currency: mRow.currency,
    provider: "paystack",
    status: "captured",
});
await assert.rejects(
    () => verifyConsumerCheckout(mismatch.reference, uidRs02),
    (e) => e.code === "PAYMENT_AMOUNT_MISMATCH"
);
assert.equal((await sessionCol.get(mismatch.reference)).status, "pending");

// --- RS06: repair does not grant credits again ---
resetAll();
metaByRef.clear();
const pack = await initConsumerCheckout(uidRs06, RS06_SKU, { email, provider: "paystack" });
const pRow = await sessionCol.get(pack.reference);
await seedCapturedLedger(pack.reference, pRow);
const usageBefore = await getConsumerSarahCreditShadowSummary(uidRs06);
assert.equal(usageBefore.topUpBalanceCredits, 0);
const packVerify = await verifyConsumerCheckout(pack.reference, uidRs06);
assert.equal(packVerify.duplicate, true);
assert.equal((await sessionCol.get(pack.reference)).status, "completed");
const usageAfter = await getConsumerSarahCreditShadowSummary(uidRs06);
assert.equal(usageAfter.topUpBalanceCredits, 0);

// --- RS06: full payment grants credits once; repair after forced pending does not double ---
resetAll();
metaByRef.clear();
const packFull = await initConsumerCheckout(uidRs06, RS06_SKU, { email, provider: "paystack" });
await verifyConsumerCheckout(packFull.reference, uidRs06);
const usagePaid = await getConsumerSarahCreditShadowSummary(uidRs06);
assert.equal(usagePaid.topUpBalanceCredits, 500);
const paidRow = await sessionCol.get(packFull.reference);
await sessionCol.put(
    packFull.reference,
    { ...paidRow, status: "pending", completedAt: undefined },
    { merge: false }
);
await verifyConsumerCheckout(packFull.reference, uidRs06);
assert.equal((await sessionCol.get(packFull.reference)).status, "completed");
const usageRepaired = await getConsumerSarahCreditShadowSummary(uidRs06);
assert.equal(usageRepaired.topUpBalanceCredits, 500);

// --- operator repair helper (dry-run + apply) ---
resetAll();
metaByRef.clear();
const repairInit = await initConsumerCheckout(uidRs02, RS02_SKU, { email, provider: "paystack" });
const repairRow = await sessionCol.get(repairInit.reference);
await seedCapturedLedger(repairInit.reference, repairRow);
const dry = await repairPendingCheckoutSessions({ dryRun: true, limit: 20 });
assert.ok(dry.results.some((r) => r.reference === repairInit.reference && r.action === "would_repair"));
const applied = await repairPendingCheckoutSessions({ dryRun: false, limit: 20 });
assert.ok(applied.results.some((r) => r.reference === repairInit.reference && r.action === "repaired"));
assert.equal((await sessionCol.get(repairInit.reference)).status, "completed");

globalThis.fetch = originalFetch;
console.log("pay-02e-checkout-session-consistency.test.mjs: ok");