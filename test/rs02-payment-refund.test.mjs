process.env.STORAGE_BACKEND = "memory";
process.env.PAYSTACK_SECRET_KEY = "sk_test_rs02_fake_key_abcdefghij";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
    initConsumerCheckout,
    verifyConsumerCheckout,
    handlePaystackCheckoutWebhook,
    clearConsumerCheckoutSessionsForTests,
} from "../services/revenue/consumerCheckoutPaymentService.js";
import { clearConsumerSubscriptionsForTests, getConsumerSubscription } from "../services/revenue/consumerSubscriptionService.js";
import { getConsumerPaymentByReference } from "../services/revenue/consumerPaymentLedger.js";
import { getCatalogueSku } from "../services/revenue/catalogueService.js";
import { DEFAULT_CONSUMER_SKU } from "../services/revenue/legacyPlanAliases.js";

const plusSku = getCatalogueSku("rs02.sarah.plus.zar.monthly");
const uid = "u-refund";
const email = "refund@example.com";
let initMeta = {};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/transaction/initialize")) {
        const body = JSON.parse(init.body);
        initMeta = body.metadata || {};
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: { authorization_url: "https://mock", reference: body.reference },
            }),
        };
    }
    if (u.includes("/transaction/verify/")) {
        const ref = decodeURIComponent(String(u).split("/").pop());
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: {
                    status: "success",
                    reference: ref,
                    amount: plusSku.amountCents,
                    currency: "ZAR",
                    metadata: initMeta,
                },
            }),
        };
    }
    throw new Error(u);
};

clearConsumerCheckoutSessionsForTests();
clearConsumerSubscriptionsForTests();

const started = await initConsumerCheckout(uid, "rs02.sarah.plus.zar.monthly", { email, provider: "paystack" });
await verifyConsumerCheckout(started.reference, uid);
let sub = await getConsumerSubscription(uid);
assert.equal(sub.skuId, "rs02.sarah.plus.zar.monthly");

const refundBody = JSON.stringify({
    event: "refund.processed",
    id: "evt_refund_1",
    data: { id: 99, reference: started.reference },
});
const refundBuf = Buffer.from(refundBody);
const sig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(refundBuf).digest("hex");
const out = await handlePaystackCheckoutWebhook(refundBuf, sig);
assert.equal(out.handled, true);
sub = await getConsumerSubscription(uid);
assert.equal(sub.skuId, DEFAULT_CONSUMER_SKU);
const ledger = await getConsumerPaymentByReference(started.reference);
assert.equal(ledger.status, "revoked");

globalThis.fetch = originalFetch;
console.log("rs02-payment-refund.test.mjs: ok");
