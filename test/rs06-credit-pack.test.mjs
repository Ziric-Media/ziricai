/**
 * US-05 — RS06 credit pack catalogue + wallet credit.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import {
    getCatalogueSku,
    getCreditPackCreditsForSku,
    isConsumerCreditPackSku,
} from "../services/revenue/catalogueService.js";
import {
    creditConsumerTopUpBalance,
    getConsumerSarahCreditShadowSummary,
    clearConsumerSarahCreditMeterForTests,
} from "../services/revenue/consumerSarahCreditMeter.js";

const SKU = "rs06.credits.consumer.500.zar";
const sku = getCatalogueSku(SKU);
assert.ok(sku);
assert.equal(sku.public, true);
assert.ok(isConsumerCreditPackSku(sku));
assert.equal(getCreditPackCreditsForSku(SKU), 500);

clearConsumerSarahCreditMeterForTests();
const uid = "rs06-test-uid";
const credited = await creditConsumerTopUpBalance(uid, 500 * 100);
assert.equal(credited.ok, true);
const usage = await getConsumerSarahCreditShadowSummary(uid);
assert.equal(usage.topUpBalanceCredits, 500);

console.log("rs06-credit-pack.test.mjs OK");