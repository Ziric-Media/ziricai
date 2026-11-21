process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";
process.env.PAYSTACK_SECRET_KEY = "";
process.env.STRIPE_SECRET_KEY = "sk_test_rs02_fake_stripe_key_abcdefghij";
process.env.RS02_CONSUMER_CHECKOUT_PROVIDER = "stripe";

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
const stripeSessionId = "cs_test_mock_session";

globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("/v1/checkout/sessions") && init?.method !== "GET") {
    const body = new URLSearchParams(init.body);
    const reference = body.get("client_reference_id");
    return {
      ok: true,
      json: async () => ({
        id: stripeSessionId,
        url: "https://checkout.stripe.com/mock",
        client_reference_id: reference,
        payment_status: "unpaid",
      }),
    };
  }
  if (u.includes(`/v1/checkout/sessions/${stripeSessionId}`)) {
    return {
      ok: true,
      json: async () => ({
        id: stripeSessionId,
        client_reference_id: "rs02_mock_ref_will_set",
        payment_status: "paid",
      }),
    };
  }
  throw new Error(`unexpected fetch ${url}`);
};

let lastReference = "";

resetRevenueConfigCacheForTests();
clearConsumerSubscriptionsForTests();
clearConsumerCheckoutSessionsForTests();

const uid = "u-stripe-1";
const email = "stripe-buyer@example.com";

globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("/v1/checkout/sessions") && (!init || init.method !== "GET")) {
    const body = new URLSearchParams(init.body);
    lastReference = body.get("client_reference_id");
    return {
      ok: true,
      json: async () => ({
        id: stripeSessionId,
        url: "https://checkout.stripe.com/mock",
        client_reference_id: lastReference,
        payment_status: "unpaid",
      }),
    };
  }
  if (u.includes(`/v1/checkout/sessions/${encodeURIComponent(stripeSessionId)}`)) {
    return {
      ok: true,
      json: async () => ({
        id: stripeSessionId,
        client_reference_id: lastReference,
        payment_status: "paid",
        amount_total: plusSku.amountCents,
        currency: "zar",
        metadata: { uid: "u-stripe-1", skuId: "rs02.sarah.plus.zar.monthly" },
      }),
    };
  }
  throw new Error(`unexpected fetch ${url}`);
};

const started = await initConsumerCheckout(uid, "rs02.sarah.plus.zar.monthly", { email });
assert.equal(started.provider, "stripe");
assert.equal(started.completed, false);
assert.ok(started.authorizationUrl);
assert.ok(started.reference);

const verified = await verifyConsumerCheckout(started.reference, uid);
assert.equal(verified.duplicate, false);
assert.equal(verified.subscription.skuId, "rs02.sarah.plus.zar.monthly");
assert.equal(verified.subscription.paymentProvider, "stripe");

const row = await getConsumerSubscription(uid);
assert.equal(row.paymentReference, started.reference);

globalThis.fetch = originalFetch;
console.log("rs02-stripe-checkout.test.mjs: ok");
