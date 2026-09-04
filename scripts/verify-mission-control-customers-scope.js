#!/usr/bin/env node
/**
 * B-MC-1.1 — production must not read legacy root customers/ when companyId is missing.
 */
import assert from 'node:assert/strict';
import { resetMemoryTenantStore } from '../services/database/tenantRepository.js';
import {
  listCustomers,
  isLegacyRootCustomerListAllowed,
  upsertCustomerFromWhatsApp,
} from '../services/customerService.js';
import { getStorageAdapter } from '../services/storage/storageAdapter.js';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';

const JOHN_PHONE = '27849000523';
const TENANT_ID = 'central-motors-rtb';

function withEnv(patch, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(patch)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync(patch, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(patch)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Mirrors admin/services/customers.js production list path. */
function resolveAdminCustomerList(companyId, apiResult) {
  if (!isDemoDataAllowed() && !companyId) {
    return { items: [], loadState: 'scope_required' };
  }
  if (!isDemoDataAllowed()) {
    if (apiResult.error) return { items: [], loadState: 'error' };
    if (apiResult.data?.scopeRequired) return { items: [], loadState: 'scope_required' };
    const items = apiResult.data?.items || [];
    return { items, loadState: items.length ? 'ok' : 'empty' };
  }
  return { items: apiResult.data?.items || [], loadState: 'ok' };
}

console.log('verify-mission-control-customers-scope');

withEnv({ NODE_ENV: 'production', STORAGE_BACKEND: 'memory', MISSION_CONTROL_DATA_MODE: 'production' }, () => {
  assert.equal(isLegacyRootCustomerListAllowed({}), false);
  assert.equal(isLegacyRootCustomerListAllowed({ companyId: TENANT_ID }), false);
});

withEnv({ NODE_ENV: 'development', STORAGE_BACKEND: 'memory', MISSION_CONTROL_DATA_MODE: 'development' }, () => {
  assert.equal(isLegacyRootCustomerListAllowed({}), true);
});

await withEnvAsync(
  { NODE_ENV: 'production', STORAGE_BACKEND: 'memory', MISSION_CONTROL_DATA_MODE: 'production' },
  async () => {
    resetMemoryTenantStore();
    const adapter = await getStorageAdapter();
    await adapter.upsertCustomer(JOHN_PHONE, {
      phone: JOHN_PHONE,
      name: 'John Smith',
      companyId: 'demo-central-motors',
      companyName: 'Central Motors',
    });

    const unscoped = await listCustomers({});
    assert.equal(unscoped.length, 0, 'production unscoped must not return legacy root customers');
    assert.ok(!unscoped.some((c) => c.name === 'John Smith'), 'John Smith must not appear unscoped in production');
    assert.ok(!unscoped.some((c) => c.phone === JOHN_PHONE), '27849000523 must not appear unscoped in production');

    await upsertCustomerFromWhatsApp(JOHN_PHONE, {
      companyId: TENANT_ID,
      contactName: 'Ziric Media',
      messagePreview: 'Hi',
      explicitName: 'Spencer',
    });

    const scoped = await listCustomers({ companyId: TENANT_ID });
    assert.ok(scoped.length >= 1, 'tenant-scoped list should return Spencer');
    const spencer = scoped.find((c) => c.phone === JOHN_PHONE || c.id === JOHN_PHONE);
    assert.ok(spencer, 'Spencer record should exist for tenant');
    assert.equal(spencer.name, 'Spencer', 'tenant customer must be Spencer, not John Smith');
    assert.ok(!scoped.some((c) => c.name === 'John Smith'), 'John Smith must not appear in tenant list');

    const adminUnscoped = resolveAdminCustomerList(null, { data: { items: [], scopeRequired: true } });
    assert.equal(adminUnscoped.loadState, 'scope_required');
    assert.equal(adminUnscoped.items.length, 0);

    const adminScoped = resolveAdminCustomerList(TENANT_ID, { data: { items: scoped } });
    assert.equal(adminScoped.loadState, 'ok');
    assert.equal(adminScoped.items.find((c) => c.phone === JOHN_PHONE)?.name, 'Spencer');
  }
);

await withEnvAsync(
  { NODE_ENV: 'development', STORAGE_BACKEND: 'memory', MISSION_CONTROL_DATA_MODE: 'development' },
  async () => {
    resetMemoryTenantStore();
    const adapter = await getStorageAdapter();
    await adapter.upsertCustomer(JOHN_PHONE, {
      phone: JOHN_PHONE,
      name: 'John Smith',
      companyId: 'demo-central-motors',
    });

    const unscoped = await listCustomers({});
    assert.ok(unscoped.length >= 1, 'development may still read legacy root customers');
    assert.ok(unscoped.some((c) => c.name === 'John Smith'), 'development legacy path preserved');
  }
);

console.log('All mission-control customers scope checks passed.');
