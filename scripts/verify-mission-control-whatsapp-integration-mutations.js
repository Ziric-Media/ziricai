#!/usr/bin/env node
/**
 * B-MC-5c-2b — Platform WhatsApp integration lifecycle mutations (memory backend).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetMemoryTenantStore } from '../services/database/tenantRepository.js';
import { createCompany } from '../services/tenants/companyService.js';
import {
  getPlatformWhatsAppIntegration,
  sanitizeIntegrationForPlatform,
  upsertWhatsAppIntegration,
} from '../services/tenants/integrationService.js';
import {
  registerPlatformWhatsAppIntegration,
  configurePlatformWhatsAppIntegration,
  activatePlatformWhatsAppIntegration,
  deactivatePlatformWhatsAppIntegration,
  WHATSAPP_STATUS_PENDING,
  WHATSAPP_STATUS_ACTIVE,
  WHATSAPP_STATUS_DISCONNECTED,
} from '../services/tenants/platformWhatsAppIntegrationService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(join(ROOT, 'api', 'app.js'), 'utf8');
const PLATFORM_SERVICE = readFileSync(
  join(ROOT, 'services', 'tenants', 'platformWhatsAppIntegrationService.js'),
  'utf8'
);

const RUNTIME_GUARD_FILES = [
  'services/integrations/webhookRouter.js',
  'services/integrations/types/integrationConfig.js',
  'services/queue/workers/messageWorker.js',
  'services/whatsapp.js',
];

const RTB_ID = 'central-motors-rtb';

function extractRouteBlock(source, method, path) {
  const pattern = new RegExp(
    `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i'
  );
  const match = pattern.exec(source);
  assert.ok(match, `Missing route: app.${method}("${path}")`);
  return source.slice(match.index, match.index + 900);
}

async function expectStatus(fn, status, message) {
  try {
    await fn();
    assert.fail(message || `Expected status ${status}`);
  } catch (err) {
    assert.equal(err.status, status, err.message);
  }
}

console.log('verify-mission-control-whatsapp-integration-mutations');

const routes = [
  ['post', '/api/platform/companies/:companyId/integrations/whatsapp/register'],
  ['patch', '/api/platform/companies/:companyId/integrations/whatsapp'],
  ['post', '/api/platform/companies/:companyId/integrations/whatsapp/activate'],
  ['post', '/api/platform/companies/:companyId/integrations/whatsapp/deactivate'],
];

for (const [method, path] of routes) {
  const block = extractRouteBlock(APP_JS, method, path);
  assert.match(block, /requirePlatformAccess\(\)/);
  assert.match(block, /validateCompanyIdParam\("params"\)/);
  assert.match(block, /authRateLimit\("platform-integrations"\)/);
}

assert.doesNotMatch(PLATFORM_SERVICE, /whatsappConnected\s*[:=]/);
assert.doesNotMatch(APP_JS, /platform_whatsapp_[a-z]+[\s\S]{0,400}whatsappConnected/);

process.env.STORAGE_BACKEND = 'memory';
resetMemoryTenantStore();

await createCompany('mc-wa-a', { name: 'WA A' });
await createCompany('mc-wa-b', { name: 'WA B' });
await createCompany('mc-wa-c', { name: 'WA C' });

const registered = await registerPlatformWhatsAppIntegration('mc-wa-a', {
  credentialsSource: 'env',
});
assert.equal(registered.status, WHATSAPP_STATUS_PENDING);
assert.equal(registered.credentialsSource, 'env');

await expectStatus(
  () => registerPlatformWhatsAppIntegration('mc-wa-a'),
  409,
  'duplicate register'
);

const configured = await configurePlatformWhatsAppIntegration('mc-wa-a', {
  phoneNumberId: '1209265748933701',
  displayPhoneNumber: '+27 71 000 0001',
});
assert.equal(configured.status, WHATSAPP_STATUS_PENDING);
assert.equal(configured.phoneNumberId, '***3701');

process.env.PHONE_NUMBER_ID = '1209265748933701';
process.env.WHATSAPP_TOKEN = 'test-token';

const activated = await activatePlatformWhatsAppIntegration('mc-wa-a');
assert.equal(activated.integration.status, WHATSAPP_STATUS_ACTIVE);
assert.equal(activated.runtimeReady, true);
assert.deepEqual(activated.missing, []);

await upsertWhatsAppIntegration('mc-wa-c', {
  phoneNumberId: '1209265748933702',
  status: WHATSAPP_STATUS_ACTIVE,
  credentialsSource: 'env',
});

const stillActive = await configurePlatformWhatsAppIntegration('mc-wa-c', {
  displayPhoneNumber: '+27 71 000 0002',
});
assert.equal(stillActive.status, WHATSAPP_STATUS_ACTIVE);
assert.equal(stillActive.displayPhoneNumber, '+27 71 000 0002');

await registerPlatformWhatsAppIntegration('mc-wa-b', { credentialsSource: 'env' });
await expectStatus(
  () => configurePlatformWhatsAppIntegration('mc-wa-b', { phoneNumberId: '1209265748933701' }),
  409,
  'duplicate active phone on configure'
);

const deactivated = await deactivatePlatformWhatsAppIntegration('mc-wa-a', {
  reason: 'test deactivate',
});
assert.equal(deactivated.deactivated, true);
assert.equal(deactivated.integration.status, WHATSAPP_STATUS_DISCONNECTED);
assert.equal(deactivated.integration.phoneNumberId, '***3701');
assert.equal(deactivated.integration.credentialsSource, 'env');

const reactivated = await activatePlatformWhatsAppIntegration('mc-wa-a', {
  acknowledgeEnvCredentials: true,
});
assert.equal(reactivated.integration.status, WHATSAPP_STATUS_ACTIVE);

await expectStatus(
  () => configurePlatformWhatsAppIntegration('mc-wa-missing', { phoneNumberId: '1209265748933999' }),
  404
);

await expectStatus(() => registerPlatformWhatsAppIntegration('missing-company-id'), 404);

const sanitized = sanitizeIntegrationForPlatform({
  id: 'whatsapp',
  status: 'active',
  phoneNumberId: '1209265748933699',
  accessToken: 'secret',
  webhookSecret: 'secret2',
});
assert.equal(sanitized.accessToken, undefined);
assert.equal(sanitized.webhookSecret, undefined);

assert.equal(await getPlatformWhatsAppIntegration(RTB_ID), null, 'RTB must not be touched in tests');

for (const rel of RUNTIME_GUARD_FILES) {
  assert.ok(readFileSync(join(ROOT, rel), 'utf8').length > 0, `${rel} readable`);
}

console.log('All mission-control WhatsApp integration mutation checks passed.');
