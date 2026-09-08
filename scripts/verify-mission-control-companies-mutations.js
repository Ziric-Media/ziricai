#!/usr/bin/env node
/**
 * B-MC-5c-1 — Mission Control company mutations use platform API, not browser Firestore.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import {
  assertAllowedCompanyStatus,
  updatePlatformCompanyAdmin,
  deleteCompanyRecord,
  activateCompany,
} from '../services/tenants/companyService.js';
import { isValidCompanyId } from '../services/auth/validateInput.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(join(ROOT, 'api', 'app.js'), 'utf8');
const API_JS = readFileSync(join(ROOT, 'js', 'admin', 'api.js'), 'utf8');
const COMPANIES_SERVICE = readFileSync(join(ROOT, 'js', 'admin', 'services', 'companies.js'), 'utf8');

const RUNTIME_GUARD_FILES = [
  'services/queue/workers/messageWorker.js',
  'services/tenants/integrationService.js',
  'services/integrations/crmSyncService.js',
];

function extractRouteBlock(source, method, path) {
  const pattern = new RegExp(
    `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i'
  );
  const match = pattern.exec(source);
  assert.ok(match, `Missing route: app.${method}("${path}")`);
  return source.slice(match.index, match.index + 700);
}

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

console.log('verify-mission-control-companies-mutations');

// 1. Platform mutation routes require platform auth
for (const [method, path] of [
  ['post', '/api/platform/companies'],
  ['patch', '/api/platform/companies/:companyId'],
  ['delete', '/api/platform/companies/:companyId'],
]) {
  assert.match(extractRouteBlock(APP_JS, method, path), /requirePlatformAccess\(\)/);
}

// 2. Status validation
assert.equal(assertAllowedCompanyStatus('active'), 'active');
assert.equal(assertAllowedCompanyStatus('suspended'), 'suspended');
assert.throws(() => assertAllowedCompanyStatus('bogus'), /Invalid company status/);

// 3. Service-level update/delete (memory backend — no production data)
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';
const { resetMemoryTenantStore } = await import('../services/database/tenantRepository.js');
resetMemoryTenantStore();

const { createCompany, getCompany } = await import('../services/tenants/companyService.js');
await createCompany('mc-test-co', { name: 'MC Test Co', status: 'active', industry: 'QA' });
const updated = await updatePlatformCompanyAdmin('mc-test-co', {
  industry: 'Automotive QA',
  status: 'suspended',
});
assert.equal(updated.industry, 'Automotive QA');
assert.equal(updated.status, 'suspended');
assert.equal((await getCompany('mc-test-co'))?.status, 'suspended');

await activateCompany('mc-test-co');
assert.equal((await getCompany('mc-test-co'))?.status, 'active');

await deleteCompanyRecord('mc-test-co');
assert.equal(await getCompany('mc-test-co'), null);

// Tenant isolation — other company unaffected
await createCompany('mc-test-other', { name: 'Other Co' });
await createCompany('mc-test-target', { name: 'Target Co' });
await deleteCompanyRecord('mc-test-target');
assert.equal(await getCompany('mc-test-target'), null);
assert.ok(await getCompany('mc-test-other'));

function productionGuardBlock(source, fnName) {
  const fnStart = source.indexOf(`export async function ${fnName}`);
  assert.notEqual(fnStart, -1, `Missing function ${fnName}`);
  const fnEnd = source.indexOf('export async function', fnStart + 10);
  const fnBody = fnEnd === -1 ? source.slice(fnStart) : source.slice(fnStart, fnEnd);
  const match = fnBody.match(/if \(!isDemoDataAllowed\(\)\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, `${fnName} missing production guard block`);
  return match[1];
}

// 4. Production frontend mutation path — platform API only (demo fallback may still use Firestore)
withMode('production', () => {
  assert.equal(isDemoDataAllowed(), false);
});

for (const [fnName, apiPattern] of [
  ['createCompany', /createPlatformCompany/],
  ['updateCompany', /updatePlatformCompany/],
  ['deleteCompany', /deletePlatformCompany/],
]) {
  const block = productionGuardBlock(COMPANIES_SERVICE, fnName);
  assert.match(block, apiPattern, `${fnName} production block must call platform API`);
  assert.doesNotMatch(block, /createDocument|updateDocument|removeDocument/);
}

// 5. API client exports
assert.match(API_JS, /export async function createPlatformCompany/);
assert.match(API_JS, /export async function updatePlatformCompany/);
assert.match(API_JS, /export async function deletePlatformCompany/);
assert.match(API_JS, /POST[\s\S]*\/api\/platform\/companies/);
assert.match(API_JS, /PATCH[\s\S]*\/api\/platform\/companies/);
assert.match(API_JS, /DELETE[\s\S]*\/api\/platform\/companies/);

// 6. companyId format guard reused on platform routes
assert.ok(isValidCompanyId('central-motors-rtb'));
assert.ok(!isValidCompanyId('../evil'));

// 7. Sarah/runtime files unchanged in this diff (presence check only)
for (const rel of RUNTIME_GUARD_FILES) {
  assert.ok(readFileSync(join(ROOT, rel), 'utf8').length > 0, `${rel} readable`);
}

console.log('All mission-control companies mutation checks passed.');
