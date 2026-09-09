#!/usr/bin/env node
/**
 * B-MC-5c-2d — legacy company-root WhatsApp field migration checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCompany,
  updateCompany,
  updatePlatformCompanyAdmin,
  stripLegacyWhatsAppRootFields,
  applyWhatsAppDisplayFromIntegration,
  enrichCompanyIntegrationStatus,
} from '../services/tenants/companyService.js';
import { resetMemoryTenantStore } from '../services/database/tenantRepository.js';
import { upsertWhatsAppIntegration } from '../services/tenants/integrationService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANY_SERVICE = readFileSync(join(ROOT, 'services/tenants/companyService.js'), 'utf8');
const ONBOARDING = readFileSync(join(ROOT, 'services/platform/onboardingService.js'), 'utf8');
const PROVISIONING = readFileSync(join(ROOT, 'services/platform/provisioningService.js'), 'utf8');
const SARAH_CTX = readFileSync(join(ROOT, 'services/sarah/sarahContext.js'), 'utf8');
const PORTAL_SETTINGS = readFileSync(join(ROOT, 'js/portal/modules/settings.js'), 'utf8');
const FIRESTORE_RULES = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
const AGENT_DISPLAY = readFileSync(join(ROOT, 'js/admin/services/agentDisplay.js'), 'utf8');

console.log('verify-mission-control-legacy-whatsapp-fields');

assert.match(COMPANY_SERVICE, /export function stripLegacyWhatsAppRootFields/);
assert.doesNotMatch(
  COMPANY_SERVICE.slice(COMPANY_SERVICE.indexOf('function normalizeCompanyRecord'), COMPANY_SERVICE.indexOf('function normalizeCompanyRecord') + 900),
  /whatsappConnected:|whatsappNumber:/
);
assert.doesNotMatch(
  COMPANY_SERVICE.slice(COMPANY_SERVICE.indexOf('PLATFORM_ADMIN_EXTRA_FIELDS'), COMPANY_SERVICE.indexOf('PLATFORM_ADMIN_EXTRA_FIELDS') + 400),
  /whatsappBusinessId|whatsappWebhookUrl/
);

assert.doesNotMatch(ONBOARDING, /whatsappConnected:\s*true[\s\S]{0,120}savePortalCompany/);
assert.doesNotMatch(ONBOARDING, /updateCompany[\s\S]{0,200}whatsappConnected:\s*session\.whatsappConnected/);

assert.doesNotMatch(
  PROVISIONING.slice(PROVISIONING.indexOf('await createCompany'), PROVISIONING.indexOf('await createCompany') + 500),
  /whatsappConnected|whatsappNumber/
);

assert.doesNotMatch(SARAH_CTX, /resolvedCompany\?\.whatsappConnected/);
assert.match(SARAH_CTX, /not_configured/);

assert.match(PORTAL_SETTINGS, /formatPortalWhatsAppDisplay/);
assert.match(PORTAL_SETTINGS, /displayPhoneNumber/);
assert.doesNotMatch(PORTAL_SETTINGS, /company\.whatsappNumber/);
assert.doesNotMatch(PORTAL_SETTINGS, /company\.whatsappConnected/);

assert.match(AGENT_DISPLAY, /isCompanyWhatsAppActive/);
assert.match(AGENT_DISPLAY, /whatsappIntegration/);

assert.doesNotMatch(FIRESTORE_RULES, /'whatsappNumber'/);
assert.doesNotMatch(FIRESTORE_RULES, /'whatsappConnected'/);

process.env.STORAGE_BACKEND = 'memory';
resetMemoryTenantStore();

const companyId = 'mc-legacy-wa-test';
const created = await createCompany(companyId, {
  name: 'Legacy WA Test Co',
  whatsappConnected: true,
  whatsappNumber: '+27000000000',
  whatsappBusinessId: 'WABA-OLD',
  whatsappWebhookUrl: 'https://example.test/webhook',
});

assert.equal(created.whatsappConnected, undefined);
assert.equal(created.whatsappNumber, undefined);
assert.equal(created.whatsappBusinessId, undefined);
assert.equal(created.whatsappWebhookUrl, undefined);

await updatePlatformCompanyAdmin(companyId, {
  name: 'Updated Co',
  whatsappConnected: true,
  whatsappNumber: '+27111111111',
  whatsappBusinessId: 'WABA-NEW',
  whatsappWebhookUrl: 'https://example.test/new',
  industry: 'Automotive',
});
const afterPatch = await updateCompany(companyId, { industry: 'Retail' });
assert.equal(afterPatch.industry, 'Retail');
assert.equal(afterPatch.whatsappConnected, undefined);
assert.equal(afterPatch.whatsappNumber, undefined);

await upsertWhatsAppIntegration(companyId, {
  status: 'active',
  phoneNumberId: '1209265748933699',
  displayPhoneNumber: '+27 71 000 1234',
});
const enriched = await enrichCompanyIntegrationStatus({ id: companyId, name: 'Updated Co' });
assert.equal(enriched.whatsappConnected, true, 'derived compatibility output from integration');
assert.equal(enriched.whatsappIntegration.status, 'active');

const falseRoot = applyWhatsAppDisplayFromIntegration(
  { id: companyId, whatsappConnected: true, whatsappNumber: '+27999999999' },
  { companyId, status: 'disconnected', displayPhoneNumber: '+27 71 000 1234' }
);
assert.equal(falseRoot.whatsappConnected, false, 'root true must not override inactive integration');

assert.deepEqual(stripLegacyWhatsAppRootFields({ name: 'X', whatsappConnected: true }), { name: 'X' });

console.log('All B-MC-5c-2d legacy WhatsApp field checks passed.');
