process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";

import assert from "node:assert/strict";
import { clearConsumerSubscriptionsForTests, applyConsumerCheckout, getConsumerSubscription } from "../services/revenue/consumerSubscriptionService.js";
import { getConsumerEntitlements } from "../services/revenue/entitlementEngine.js";
import { isCommercialActive } from "../services/revenue/revenueConfig.js";
import { resetRevenueConfigCacheForTests } from "../services/revenue/revenueConfig.js";

resetRevenueConfigCacheForTests();
clearConsumerSubscriptionsForTests();

assert.equal(await isCommercialActive("rs02SarahCheckout"), true);

const uid = "u-rs02-co";
const co = await applyConsumerCheckout(uid, "rs02.sarah.plus.zar.monthly");
assert.equal(co.subscription.skuId, "rs02.sarah.plus.zar.monthly");

const sub = await getConsumerSubscription(uid);
assert.equal(sub.skuId, "rs02.sarah.plus.zar.monthly");
assert.ok(sub.periodStart);
assert.ok(sub.periodEnd);

const ent = await getConsumerEntitlements(uid);
assert.equal(ent.sarahLimits.workTasksPerDay, 100);

console.log("rs02-consumer-checkout.test.mjs: ok");