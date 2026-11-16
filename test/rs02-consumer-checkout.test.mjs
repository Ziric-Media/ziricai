process.env.STORAGE_BACKEND = "memory";
process.env.RS02_SARAH_CHECKOUT = "true";

import assert from "node:assert/strict";
import { clearConsumerSubscriptionsForTests, applyConsumerCheckout, getConsumerSubscription } from "../services/revenue/consumerSubscriptionService.js";
import { getConsumerEntitlements } from "../services/revenue/entitlementEngine.js";
import { getConsumerWorkTaskUsage } from "../services/revenue/consumerWorkTaskUsage.js";
import { isCommercialActive } from "../services/revenue/revenueConfig.js";
import { resetRevenueConfigCacheForTests } from "../services/revenue/revenueConfig.js";
import { clearConsumerWorkTaskUsageForTests } from "../services/revenue/consumerWorkTaskUsage.js";

resetRevenueConfigCacheForTests();
clearConsumerSubscriptionsForTests();
clearConsumerWorkTaskUsageForTests();

assert.equal(await isCommercialActive("rs02SarahCheckout"), true);

const uid = "u-rs02-co";
const co = await applyConsumerCheckout(uid, "rs02.sarah.plus.zar.monthly");
assert.equal(co.subscription.skuId, "rs02.sarah.plus.zar.monthly");

const ent = await getConsumerEntitlements(uid);
assert.equal(ent.sarahLimits.workTasksPerDay, 100);

const usage = await getConsumerWorkTaskUsage(uid);
assert.equal(usage.periodScoped, true);
assert.ok(usage.limit >= 100);

console.log("rs02-consumer-checkout.test.mjs: ok");
