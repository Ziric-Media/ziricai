#!/usr/bin/env node
/**
 * B-MC-5b/5c-2c — Mission Control Companies WhatsApp display (integration-derived).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import { normalizeCompanyItem } from '../js/admin/services/companies.js';
import { whatsappIntegrationTableLabel } from '../js/admin/services/whatsappIntegrationDisplay.js';
import {
  applyWhatsAppDisplayFromIntegration,
  buildWhatsAppIntegrationSummary,
} from '../services/tenants/companyService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANIES_MODULE = readFileSync(join(ROOT, 'js', 'admin', 'modules', 'companies.js'), 'utf8');
const COMPANIES_SERVICE = readFileSync(join(ROOT, 'js', 'admin', 'services', 'companies.js'), 'utf8');

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

console.log('verify-mission-control-companies-display');

// A. RTB — backend contract (legacy boolean + new summary)
const rtbWa = {
  companyId: 'central-motors-rtb',
  status: 'active',
  phoneNumberId: '1209265748933699',
  credentialsSource: 'env',
};
const rtbBackend = applyWhatsAppDisplayFromIntegration(
  { id: 'central-motors-rtb', whatsappConnected: false },
  rtbWa
);
assert.equal(rtbBackend.whatsappConnected, true);

process.env.PHONE_NUMBER_ID = '1209265748933699';
process.env.WHATSAPP_TOKEN = 'test-token';
const rtbSummary = buildWhatsAppIntegrationSummary(rtbWa);
assert.equal(rtbSummary.status, 'active');
assert.equal(rtbSummary.phoneNumberId, '***3699');
assert.equal(rtbSummary.runtimeReady, true);

const rtbItem = normalizeCompanyItem({ ...rtbBackend, whatsappIntegration: rtbSummary });
assert.equal(rtbItem.whatsappConnected, true);
assert.equal(whatsappIntegrationTableLabel(rtbItem), 'Active');

// B. Demo — no integration doc
const demoBackend = applyWhatsAppDisplayFromIntegration(
  { id: 'demo-central-motors', whatsappConnected: true },
  null
);
assert.equal(demoBackend.whatsappConnected, false);

const demoItem = normalizeCompanyItem({
  ...demoBackend,
  whatsappIntegration: buildWhatsAppIntegrationSummary(null),
});
assert.equal(demoItem.whatsappConnected, false);
assert.equal(whatsappIntegrationTableLabel(demoItem), 'Not registered');

// C. Table lifecycle labels (5c-2c)
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'pending_configuration' } }),
  'Pending'
);
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'active', runtimeReady: false } }),
  'Active · Runtime not ready'
);

// D. Root boolean / phone must not drive table label
const phoneOnly = normalizeCompanyItem({
  id: 'x',
  whatsappConnected: false,
  whatsappNumber: '+27123456789',
  whatsappIntegration: buildWhatsAppIntegrationSummary(null),
});
assert.equal(whatsappIntegrationTableLabel(phoneOnly), 'Not registered');

// E/F. Production list path
assert.match(COMPANIES_SERVICE, /export function normalizeCompanyItem/);
assert.match(COMPANIES_SERVICE, /whatsappConnected: raw\.whatsappConnected === true/);
assert.match(COMPANIES_SERVICE, /whatsappIntegration:/);

withMode('production', () => {
  assert.equal(isDemoDataAllowed(), false);
});

assert.match(COMPANIES_MODULE, /whatsappIntegrationTableLabel/);
assert.match(COMPANIES_MODULE, /company\?\.whatsappIntegration/);

const whatsappCellBlock = COMPANIES_MODULE.slice(
  COMPANIES_MODULE.indexOf('function whatsappCell'),
  COMPANIES_MODULE.indexOf('function actionMenu')
);
assert.doesNotMatch(whatsappCellBlock, /whatsappConnected/);
assert.doesNotMatch(whatsappCellBlock, /whatsappNumber/);

// G. Sarah safety — runtime files readable
for (const rel of [
  'services/queue/workers/messageWorker.js',
  'services/tenants/integrationService.js',
]) {
  assert.ok(readFileSync(join(ROOT, rel), 'utf8').length > 0, `${rel} readable`);
}

console.log('All mission-control companies display checks passed.');
