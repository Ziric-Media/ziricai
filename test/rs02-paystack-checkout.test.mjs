process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";
process.env.PAYSTACK_SECRET_KEY = "sk_test_rs02_fake_key_abcdefghij";

import assert from "node:assert/strict";
import {
    clearConsumerSubscriptionsForTests,
    getConsumerSubscription,
} from "../services/revenue/consumerSubscriptionService.js";
import {
    initConsumerCheckout,
    verifyConsumerCheckout,
    clearConsumerCheckoutSessionsForTests,
} from "../services/revenue/consumerCheckoutPaymentService.js";
import { resetRevenueConfigCacheForTests } from "../services/revenue/revenueConfig.js";

import { getCatalogueSku } from "../services/revenue/catalogueService.js";

const plusSku = getCatalogueSku("rs02.sarah.plus.zar.monthly");

const originalFetch = globalThis.fetch;
const calls = [];
let initMeta = {};

globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/transaction/initialize")) {
        const body = JSON.parse(init.body);
        initMeta = body.metadata || {};
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: { authorization_url: "https://checkout.paystack.com/mock", reference: body.reference },
            }),
        };
    }
    if (String(url).includes("/transaction/verify/")) {
        const ref = String(url).split("/").pop();
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: {
                    status: "success",
                    reference: decodeURIComponent(ref),
                    amount: plusSku.amountCents,
                    currency: "ZAR",
                    metadata: { uid: initMeta.uid, skuId: initMeta.skuId },
                },
            }),
        };
    }
    throw new Error(`unexpected fetch ${url}`);
};

resetRevenueConfigCacheForTests();
clearConsumerSubscriptionsForTests();
clearConsumerCheckoutSessionsForTests();
calls.length = 0;

const uid = "u-paystack-1";
const email = "buyer@example.com";

const started = await initConsumerCheckout(uid, "rs02.sarah.plus.zar.monthly", { email });
assert.equal(started.provider, "paystack");
assert.equal(started.completed, false);
assert.ok(started.authorizationUrl);
assert.ok(started.reference);
assert.equal(calls.length, 1);

const verified = await verifyConsumerCheckout(started.reference, uid);
assert.equal(verified.duplicate, false);
assert.equal(verified.subscription.skuId, "rs02.sarah.plus.zar.monthly");
assert.equal(verified.subscription.paymentProvider, "paystack");

const again = await verifyConsumerCheckout(started.reference, uid);
assert.equal(again.duplicate, true);

const row = await getConsumerSubscription(uid);
assert.equal(row.paymentReference, started.reference);

globalThis.fetch = originalFetch;
console.log("rs02-paystack-checkout.test.mjs: ok");
