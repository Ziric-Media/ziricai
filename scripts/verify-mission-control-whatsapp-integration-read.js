#!/usr/bin/env node
/**
 * B-MC-5c-2a — Platform WhatsApp integration READ API (read-only, sanitized).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPlatformWhatsAppIntegration,
  sanitizeIntegrationForPlatform,
  upsertWhatsAppIntegration,
} from '../services/tenants/integrationService.js';
import { createCompany, getCompany } from '../services/tenants/companyService.js';
import { resetMemoryTenantStore } from '../services/database/tenantRepository.js';
import { isValidCompanyId } from '../services/auth/validateInput.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(join(ROOT, 'api', 'app.js'), 'utf8');
const INTEGRATION_SERVICE = readFileSync(
  join(ROOT, 'services', 'tenants', 'integrationService.js'),
  'utf8'
);

const RUNTIME_GUARD_FILES = [
  'services/integrations/webhookRouter.js',
  'services/integrations/types/integrationConfig.js',
  'services/queue/workers/messageWorker.js',
  'services/whatsapp.js',
];

function extractRouteBlock(source, method, path) {
  const pattern = new RegExp(
    `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i'
  );
  const match = pattern.exec(source);
  assert.ok(match, `Missing route: app.${method}("${path}")`);
  return source.slice(match.index, match.index + 900);
}

console.log('verify-mission-control-whatsapp-integration-read');

// 1. Route exists with platform auth + companyId validation
const routeBlock = extractRouteBlock(
  APP_JS,
  'get',
  '/api/platform/companies/:companyId/integrations/whatsapp'
);
assert.match(routeBlock, /requirePlatformAccess\(\)/);
assert.match(routeBlock, /validateCompanyIdParam\("params"\)/);
assert.match(routeBlock, /getPlatformWhatsAppIntegration/);
assert.match(routeBlock, /Company not found/);
assert.match(routeBlock, /WhatsApp integration not found/);

// 2. Service reads integration doc only — not company-root whatsappConnected
assert.match(INTEGRATION_SERVICE, /export async function getPlatformWhatsAppIntegration/);
assert.match(INTEGRATION_SERVICE, /getWhatsAppIntegration\(companyId\)/);
assert.doesNotMatch(
  INTEGRATION_SERVICE.slice(
    INTEGRATION_SERVICE.indexOf('export async function getPlatformWhatsAppIntegration'),
    INTEGRATION_SERVICE.indexOf('export async function getPlatformWhatsAppIntegration') + 400
  ),
  /whatsappConnected|getCompany\(/
);

// 3. Sanitizer strips secrets and allowlists fields
const sanitized = sanitizeIntegrationForPlatform({
  id: 'whatsapp',
  companyId: 'mc-test-wa',
  provider: 'whatsapp',
  channel: 'whatsapp',
  status: 'active',
  phoneNumberId: '1209265748933699',
  displayPhoneNumber: '+27 71 000 1234',
  credentialsSource: 'env',
  businessAccountId: 'waba-123',
  accessToken: 'EAAsecret',
  whatsappToken: 'EAAsecret2',
  token: 'tok',
  privateKey: 'pk',
  credentials: { secret: true },
  config: { webhookSecret: 'shh' },
});
assert.equal(sanitized.id, 'whatsapp');
assert.equal(sanitized.status, 'active');
assert.equal(sanitized.phoneNumberId, '***3699');
assert.equal(sanitized.credentialsSource, 'env');
assert.equal(sanitized.accessToken, undefined);
assert.equal(sanitized.whatsappToken, undefined);
assert.equal(sanitized.credentials, undefined);
assert.equal(sanitized.config, undefined);

// 4. Memory-backend service tests (no production data)
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';
resetMemoryTenantStore();

await createCompany('mc-test-wa', { name: 'WA Test Co', status: 'active' });
await upsertWhatsAppIntegration('mc-test-wa', {
  phoneNumberId: '1209265748933699',
  status: 'active',
  credentialsSource: 'env',
});

const integration = await getPlatformWhatsAppIntegration('mc-test-wa');
assert.equal(integration.id, 'whatsapp');
assert.equal(integration.status, 'active');
assert.equal(integration.phoneNumberId, '***3699');
assert.equal(integration.credentialsSource, 'env');

// Missing integration → null (route maps to 404)
await createCompany('mc-test-no-wa', { name: 'No WA Co' });
assert.equal(await getPlatformWhatsAppIntegration('mc-test-no-wa'), null);

// Tenant isolation
await createCompany('mc-test-other-wa', { name: 'Other WA Co' });
await upsertWhatsAppIntegration('mc-test-other-wa', {
  phoneNumberId: '9999999999999999',
  status: 'active',
});
const other = await getPlatformWhatsAppIntegration('mc-test-other-wa');
const target = await getPlatformWhatsAppIntegration('mc-test-wa');
assert.notEqual(other.phoneNumberId, target.phoneNumberId);
assert.ok(await getCompany('mc-test-wa'));
assert.ok(await getCompany('mc-test-other-wa'));

// 5. companyId format guard
assert.ok(isValidCompanyId('central-motors-rtb'));
assert.ok(!isValidCompanyId('../evil'));

// 6. Runtime files present (unchanged guard)
for (const rel of RUNTIME_GUARD_FILES) {
  assert.ok(readFileSync(join(ROOT, rel), 'utf8').length > 0, `${rel} readable`);
}

console.log('All mission-control WhatsApp integration read checks passed.');
