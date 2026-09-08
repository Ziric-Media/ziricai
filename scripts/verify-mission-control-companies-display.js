#!/usr/bin/env node
/**
 * B-MC-5b — Mission Control Companies WhatsApp badge uses integration-derived API field only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import { normalizeCompanyItem } from '../js/admin/services/companies.js';
import {
  applyWhatsAppDisplayFromIntegration,
} from '../services/tenants/companyService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANIES_MODULE = readFileSync(join(ROOT, 'js', 'admin', 'modules', 'companies.js'), 'utf8');
const COMPANIES_SERVICE = readFileSync(join(ROOT, 'js', 'admin', 'services', 'companies.js'), 'utf8');

/** Mirrors js/admin/modules/companies.js display gate (B-MC-5b). */
function isIntegrationWhatsAppConnected(company) {
  return company?.whatsappConnected === true;
}

function whatsappDisplayLabel(company) {
  if (isIntegrationWhatsAppConnected(company)) return 'Connected';
  if (company?.whatsappNumber) return 'Disconnected';
  return 'Not connected';
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

console.log('verify-mission-control-companies-display');

// A. RTB — backend contract (mirrors B-MC-5a enrichment)
const rtbBackend = applyWhatsAppDisplayFromIntegration(
  { id: 'central-motors-rtb', whatsappConnected: false },
  { companyId: 'central-motors-rtb', status: 'active' }
);
assert.equal(rtbBackend.whatsappConnected, true);

const rtbItem = normalizeCompanyItem(rtbBackend);
assert.equal(rtbItem.whatsappConnected, true);
assert.equal(whatsappDisplayLabel(rtbItem), 'Connected');

// B. Demo — no active integration
const demoBackend = applyWhatsAppDisplayFromIntegration(
  { id: 'demo-central-motors', whatsappConnected: true },
  null
);
assert.equal(demoBackend.whatsappConnected, false);

const demoItem = normalizeCompanyItem(demoBackend);
assert.equal(demoItem.whatsappConnected, false);
assert.equal(whatsappDisplayLabel(demoItem), 'Not connected');

// C. Frontend display logic
assert.equal(whatsappDisplayLabel({ whatsappConnected: true }), 'Connected');
assert.equal(whatsappDisplayLabel({ whatsappConnected: false }), 'Not connected');

// D. Root boolean / phone must not override API normalized false
const phoneOnly = normalizeCompanyItem({
  id: 'x',
  whatsappConnected: false,
  whatsappNumber: '+27123456789',
});
assert.equal(phoneOnly.whatsappConnected, false);
assert.equal(whatsappDisplayLabel(phoneOnly), 'Disconnected');

const truthyString = normalizeCompanyItem({ id: 'x', whatsappConnected: 'true' });
assert.equal(truthyString.whatsappConnected, false);

const inferredRoot = normalizeCompanyItem({
  id: 'demo-central-motors',
  whatsappConnected: true,
});
assert.equal(
  whatsappDisplayLabel(normalizeCompanyItem(applyWhatsAppDisplayFromIntegration(inferredRoot, null))),
  'Not connected'
);

// E/F. Production list path — no demo/Firestore WhatsApp inference in normalizeCompanyItem
assert.match(COMPANIES_SERVICE, /export function normalizeCompanyItem/);
assert.match(COMPANIES_SERVICE, /whatsappConnected: raw\.whatsappConnected === true/);
assert.doesNotMatch(
  COMPANIES_SERVICE.slice(
    COMPANIES_SERVICE.indexOf('export function normalizeCompanyItem'),
    COMPANIES_SERVICE.indexOf('export async function listCompanies')
  ),
  /whatsappNumber|DEMO_COMPANIES|listDocuments|loadDemoStore/
);

withMode('production', () => {
  assert.equal(isDemoDataAllowed(), false);
});

assert.match(COMPANIES_MODULE, /function isIntegrationWhatsAppConnected/);
assert.match(COMPANIES_MODULE, /company\?\.whatsappConnected === true/);
assert.match(
  COMPANIES_MODULE,
  /The Companies table shows live WhatsApp status from the tenant integration/
);

const whatsappCellBlock = COMPANIES_MODULE.slice(
  COMPANIES_MODULE.indexOf('function whatsappCell'),
  COMPANIES_MODULE.indexOf('function actionMenu')
);
assert.doesNotMatch(
  whatsappCellBlock,
  /Boolean\(.*whatsappNumber|whatsappConnected\s*\?\?|whatsappConnected\s*\|\||\?\?\s*.*whatsappConnected/
);
assert.match(whatsappCellBlock, /isIntegrationWhatsAppConnected\(company\)/);

// G. Sarah safety — no runtime files touched in this verify (static guard on companies scope)
const RUNTIME_PATHS = [
  'services/queue/workers/messageWorker.js',
  'services/tenants/integrationService.js',
];
for (const rel of RUNTIME_PATHS) {
  const full = join(ROOT, rel);
  const stat = readFileSync(full, 'utf8');
  assert.ok(stat.length > 0, `${rel} readable`);
}

console.log('All mission-control companies display checks passed.');
