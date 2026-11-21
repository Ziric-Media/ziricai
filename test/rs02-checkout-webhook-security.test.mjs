import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyPaystackWebhookSignature } from "../services/payments/paystackClient.js";
import { verifyStripeWebhookSignature } from "../services/payments/stripeClient.js";

process.env.PAYSTACK_SECRET_KEY = "sk_test_webhook_paystack_only";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_rs02_fake";

const payBody = Buffer.from('{"event":"charge.success","data":{"id":1,"reference":"rs02_x"}}');
const paySig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(payBody).digest("hex");
assert.equal(verifyPaystackWebhookSignature(payBody, paySig), true);
assert.equal(verifyPaystackWebhookSignature(payBody, "bad"), false);

const ts = Math.floor(Date.now() / 1000);
const stripeBody = Buffer.from(`{"id":"evt_test","type":"checkout.session.completed"}`);
const stripeSigned = `${ts}.${stripeBody.toString("utf8")}`;
const stripeV1 = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(stripeSigned).digest("hex");
const stripeHeader = `t=${ts},v1=${stripeV1}`;
assert.equal(verifyStripeWebhookSignature(stripeBody, stripeHeader), true);
assert.equal(verifyStripeWebhookSignature(stripeBody, "t=1,v1=deadbeef"), false);

process.env.STRIPE_WEBHOOK_TOLERANCE_SEC = "1";
const oldTs = ts - 120;
const oldSigned = `${oldTs}.${stripeBody.toString("utf8")}`;
const oldV1 = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(oldSigned).digest("hex");
assert.equal(verifyStripeWebhookSignature(stripeBody, `t=${oldTs},v1=${oldV1}`), false);

console.log("rs02-checkout-webhook-security.test.mjs: ok");
