process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";
process.env.PAYSTACK_SECRET_KEY = "sk_test_rs02_fake_key_abcdefghij";
process.env.STRIPE_SECRET_KEY = "sk_test_rs02_fake_stripe_key_abcdefghij";

import assert from "node:assert/strict";
import {
    initConsumerCheckout,
    verifyConsumerCheckout,
    resolveCheckoutProvider,
    clearConsumerCheckoutSessionsForTests,
} from "../services/revenue/consumerCheckoutPaymentService.js";
import { clearConsumerSubscriptionsForTests } from "../services/revenue/consumerSubscriptionService.js";
import { resetRevenueConfigCacheForTests } from "../services/revenue/revenueConfig.js";
import { getCatalogueSku } from "../services/revenue/catalogueService.js";

const SKU = "rs02.sarah.plus.zar.monthly";
const sku = getCatalogueSku(SKU);
const uid = "u-hardening";
const email = "harden@example.com";

assert.throws(
    () => resolveCheckoutProvider({ provider: "bogus" }),
    (e) => e.code === "CHECKOUT_PROVIDER_INVALID"
);

const savedStripe = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = "";
assert.throws(
    () => resolveCheckoutProvider({ provider: "stripe" }),
    (e) => e.code === "STRIPE_NOT_CONFIGURED"
);
assert.equal(resolveCheckoutProvider({}), "paystack");
process.env.STRIPE_SECRET_KEY = savedStripe;

const originalFetch = globalThis.fetch;
let lastRef = "";
let meta = {};

globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/transaction/initialize")) {
        const body = JSON.parse(init.body);
        lastRef = body.reference;
        meta = body.metadata;
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: { authorization_url: "https://checkout.paystack.com/mock", reference: lastRef },
            }),
        };
    }
    if (u.includes("/transaction/verify/")) {
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: {
                    status: "success",
                    reference: lastRef,
                    amount: 1,
                    currency: "ZAR",
                    metadata: { uid: meta.uid, skuId: meta.skuId },
                },
            }),
        };
    }
    throw new Error(`unexpected ${url}`);
};

resetRevenueConfigCacheForTests();
clearConsumerSubscriptionsForTests();
clearConsumerCheckoutSessionsForTests();

const started = await initConsumerCheckout(uid, SKU, { email, provider: "paystack" });
await assert.rejects(
    () => verifyConsumerCheckout(started.reference, uid),
    (e) => e.code === "PAYMENT_AMOUNT_MISMATCH"
);

globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/transaction/initialize")) {
        const body = JSON.parse(init.body);
        lastRef = body.reference;
        meta = body.metadata;
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: { authorization_url: "https://checkout.paystack.com/mock", reference: lastRef },
            }),
        };
    }
    if (u.includes("/transaction/verify/")) {
        return {
            ok: true,
            json: async () => ({
                status: true,
                data: {
                    status: "success",
                    reference: lastRef,
                    amount: sku.amountCents,
                    currency: "ZAR",
                    metadata: { uid: meta.uid, skuId: meta.skuId },
                },
            }),
        };
    }
    throw new Error(`unexpected ${url}`);
};

const started2 = await initConsumerCheckout(uid, SKU, { email, provider: "paystack" });
const ok = await verifyConsumerCheckout(started2.reference, uid);
assert.equal(ok.duplicate, false);
assert.equal(ok.subscription.skuId, SKU);

await assert.rejects(
    () => verifyConsumerCheckout(started2.reference, "other-uid"),
    (e) => e.code === "CHECKOUT_FORBIDDEN"
);

globalThis.fetch = originalFetch;
console.log("rs02-checkout-hardening.test.mjs: ok");
