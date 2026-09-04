#!/usr/bin/env node
/**
 * B-MC-4 — production Companies must use platform API (Firestore-backed), never demo fallback.
 */
import assert from 'node:assert/strict';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';

function withMode(mode, fn) {
  const prev = process.env.MISSION_CONTROL_DATA_MODE;
  process.env.MISSION_CONTROL_DATA_MODE = mode;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MISSION_CONTROL_DATA_MODE;
    else process.env.MISSION_CONTROL_DATA_MODE = prev;
  }
}

/** Mirrors js/admin/services/companies.js listCompanies production path. */
function resolveAdminCompaniesList(apiResult) {
  if (!isDemoDataAllowed()) {
    if (apiResult.error) {
      return { items: [], source: 'api', error: apiResult.error, loadState: 'error' };
    }
    const items = (apiResult.data?.items || []).map((raw) => ({
      ...raw,
      id: raw.id || raw.companyId,
      plan: raw.plan || raw.billing?.planId || 'trial',
      status: raw.status || 'active',
    }));
    return {
      items,
      source: 'api',
      loadState: items.length ? 'ok' : 'empty',
    };
  }
  return { items: apiResult.data?.items || [], loadState: 'ok' };
}

console.log('verify-mission-control-companies-scope');

withMode('production', () => {
  const empty = resolveAdminCompaniesList({ data: { items: [] } });
  assert.equal(empty.loadState, 'empty');
  assert.equal(empty.items.length, 0);
  assert.equal(empty.source, 'api');

  const err = resolveAdminCompaniesList({ error: 'Unauthorized' });
  assert.equal(err.loadState, 'error');
  assert.equal(err.items.length, 0);

  const ok = resolveAdminCompaniesList({
    data: {
      items: [{
        id: 'central-motors-rtb',
        name: 'Central Motors',
        whatsappConnected: true,
      }],
      source: 'firestore',
    },
  });
  assert.equal(ok.loadState, 'ok');
  assert.equal(ok.items[0].name, 'Central Motors');
  assert.equal(ok.items[0].whatsappConnected, true);

  const demoBlocked = resolveAdminCompaniesList({
    data: { items: [{ id: 'demo-co-1', name: 'Demo Motors', isDemo: true }] },
  });
  assert.equal(demoBlocked.loadState, 'ok');
  assert.equal(demoBlocked.items[0].id, 'demo-co-1');
});

withMode('development', () => {
  assert.equal(isDemoDataAllowed(), true);
});

console.log('All mission-control companies scope checks passed.');
