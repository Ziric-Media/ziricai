/**
 * B-MC-0 verification — centralized Mission Control production demo kill switch.
 */
import assert from 'node:assert/strict';
import {
  getMissionControlDataMode,
  isProductionMissionControl,
  isDemoDataAllowed,
  shouldUseDemoForEmptyOrError,
  shouldUseDemoOnApiError,
  resolveListItems,
  DATA_MODE,
} from '../js/admin/services/dataMode.js';

const DEMO_CUSTOMERS = [{ id: 'demo-1', name: 'John Smith', phone: '27849000523' }];

function withMode(mode, fn) {
  const prev = process.env.MISSION_CONTROL_DATA_MODE;
  process.env.MISSION_CONTROL_DATA_MODE = mode;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.MISSION_CONTROL_DATA_MODE;
    else process.env.MISSION_CONTROL_DATA_MODE = prev;
  }
}

console.log('verify-mission-control-data-mode');

withMode('production', () => {
  assert.equal(getMissionControlDataMode(), DATA_MODE.PRODUCTION);
  assert.equal(isProductionMissionControl(), true);
  assert.equal(isDemoDataAllowed(), false);
});

withMode('development', () => {
  assert.equal(getMissionControlDataMode(), DATA_MODE.DEVELOPMENT);
  assert.equal(isDemoDataAllowed(), true);
});

withMode('production', () => {
  assert.equal(shouldUseDemoForEmptyOrError({ items: [] }), false);
  assert.equal(shouldUseDemoForEmptyOrError({ error: 'Network error' }), false);
  assert.equal(shouldUseDemoOnApiError({ error: 'fail' }), false);
  assert.deepEqual(resolveListItems({ items: [] }, DEMO_CUSTOMERS), []);
  assert.deepEqual(resolveListItems({ error: 'fail' }, DEMO_CUSTOMERS), []);
});

withMode('development', () => {
  assert.equal(shouldUseDemoForEmptyOrError({ items: [] }), true);
  assert.equal(shouldUseDemoForEmptyOrError({ error: 'Network error' }), true);
  assert.equal(shouldUseDemoOnApiError({ error: 'fail' }), true);
  assert.equal(shouldUseDemoOnApiError({ items: [] }), false);
  assert.deepEqual(resolveListItems({ items: [] }, DEMO_CUSTOMERS), DEMO_CUSTOMERS);
});

/** Mirrors customers.js listCustomers production path — no John Smith on empty API. */
function resolveCustomerListProduction(api) {
  if (api.error) {
    return { items: [], source: 'api', error: api.error, loadState: 'error' };
  }
  const items = api.data?.items || [];
  return { items, source: 'api', loadState: items.length ? 'ok' : 'empty' };
}

withMode('production', () => {
  const empty = resolveCustomerListProduction({ data: { items: [] } });
  assert.equal(empty.loadState, 'empty');
  assert.equal(empty.items.length, 0);
  assert.ok(!empty.items.some((c) => c.name === 'John Smith'));

  const err = resolveCustomerListProduction({ error: 'Unable to load customers' });
  assert.equal(err.loadState, 'error');
  assert.equal(err.items.length, 0);
});

withMode('development', () => {
  const wouldUseDemo = shouldUseDemoForEmptyOrError({ data: { items: [] }, items: [] });
  assert.equal(wouldUseDemo, true);
});

console.log('All mission-control data mode checks passed.');
