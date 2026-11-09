/**
 * R0 — catalogue, ledger idempotency, consumer entitlements, legacy plan alias.
 */
process.env.STORAGE_BACKEND = 'memory';

import assert from 'node:assert/strict';
import { listCatalogueSkus, getCatalogueSku } from '../services/revenue/catalogueService.js';
import { appendLedgerEvent, clearLedgerForTests } from '../services/revenue/ledgerService.js';
import { getConsumerEntitlements, evaluateLegacyPlanLimit } from '../services/revenue/entitlementEngine.js';
import { legacyPlanIdToSku, DEFAULT_CONSUMER_SKU } from '../services/revenue/legacyPlanAliases.js';
import { getRevenueConfig, resetRevenueConfigCacheForTests } from '../services/revenue/revenueConfig.js';

clearLedgerForTests();
resetRevenueConfigCacheForTests();

const publicSkus = listCatalogueSkus(true);
assert.ok(publicSkus.some((s) => s.skuId === DEFAULT_CONSUMER_SKU), 'Sarah Free public SKU');
assert.ok(publicSkus.some((s) => s.skuId === 'rs01.company.starter.zar.monthly'), 'Starter public SKU');

const starterSku = getCatalogueSku('rs01.company.starter.zar.monthly');
assert.equal(starterSku.revenueStreamId, 'RS01');

assert.equal(legacyPlanIdToSku('starter'), 'rs01.company.starter.zar.monthly');

const ent = await getConsumerEntitlements('u-test-1');
assert.equal(ent.accountType, 'consumer');
assert.equal(ent.skuId, DEFAULT_CONSUMER_SKU);
assert.equal(ent.enforcementMode, 'shadow');
assert.ok(ent.sarahLimits.dailyChats >= 1);

const cfg = await getRevenueConfig();
assert.equal(cfg.commercialActivation.rs02SarahCheckout, false);

const first = await appendLedgerEvent({
  eventType: 'payment.succeeded',
  revenueStreamId: 'RS02',
  accountType: 'consumer',
  accountId: 'u-test-1',
  grossAmountCents: 9900,
  currency: 'ZAR',
  paymentStatus: 'succeeded',
  idempotencyKey: 'test-key-1',
});
const dup = await appendLedgerEvent({
  eventType: 'payment.succeeded',
  revenueStreamId: 'RS02',
  accountType: 'consumer',
  accountId: 'u-test-1',
  grossAmountCents: 9900,
  currency: 'ZAR',
  paymentStatus: 'succeeded',
  idempotencyKey: 'test-key-1',
});
assert.equal(first.duplicate, false);
assert.equal(dup.duplicate, true);

const aiCheck = evaluateLegacyPlanLimit('starter', 'aiEmployees', 1, 1);
assert.equal(aiCheck.allowed, true);

console.log('revenue-r0.test.mjs: ok');
