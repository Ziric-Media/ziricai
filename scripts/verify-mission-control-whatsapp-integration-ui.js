#!/usr/bin/env node
/**
 * B-MC-5c-2c — Mission Control WhatsApp integration UI (static verification).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  whatsappIntegrationTableLabel,
  humanizeMissingRequirement,
} from '../js/admin/services/whatsappIntegrationDisplay.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANIES_MODULE = readFileSync(join(ROOT, 'js', 'admin', 'modules', 'companies.js'), 'utf8');
const COMPANIES_SERVICE = readFileSync(join(ROOT, 'js', 'admin', 'services', 'companies.js'), 'utf8');
const API_JS = readFileSync(join(ROOT, 'js', 'admin', 'api.js'), 'utf8');
const APP_JS = readFileSync(join(ROOT, 'api', 'app.js'), 'utf8');
const AGENTS_MODULE = readFileSync(join(ROOT, 'js', 'admin', 'modules', 'agents.js'), 'utf8');

const RTB_ID = 'central-motors-rtb';

console.log('verify-mission-control-whatsapp-integration-ui');

// 1. Lifecycle labels
assert.equal(whatsappIntegrationTableLabel({ whatsappIntegration: { status: null } }), 'Not registered');
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'pending_configuration' } }),
  'Pending'
);
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'disconnected' } }),
  'Disconnected'
);
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'active', runtimeReady: true } }),
  'Active'
);
assert.equal(
  whatsappIntegrationTableLabel({ whatsappIntegration: { status: 'active', runtimeReady: false } }),
  'Active · Runtime not ready'
);

// 2. Not using "Connected" as lifecycle label in table helper
assert.doesNotMatch(
  readFileSync(join(ROOT, 'js', 'admin', 'services', 'whatsappIntegrationDisplay.js'), 'utf8'),
  /return 'Connected'/
);

// 3. Table uses whatsappIntegration
assert.match(COMPANIES_MODULE, /whatsappIntegrationTableLabel\(company\)/);
assert.match(COMPANIES_MODULE, /company\?\.whatsappIntegration/);

const whatsappCellBlock = COMPANIES_MODULE.slice(
  COMPANIES_MODULE.indexOf('function whatsappCell'),
  COMPANIES_MODULE.indexOf('function actionMenu')
);
assert.doesNotMatch(whatsappCellBlock, /company\?\.whatsappConnected/);
assert.doesNotMatch(whatsappCellBlock, /company\?\.whatsappNumber/);

// 4. API helpers wired
for (const fn of [
  'fetchPlatformWhatsAppIntegration',
  'registerPlatformWhatsAppIntegration',
  'configurePlatformWhatsAppIntegration',
  'activatePlatformWhatsAppIntegration',
  'deactivatePlatformWhatsAppIntegration',
]) {
  assert.match(COMPANIES_MODULE, new RegExp(fn));
  assert.match(API_JS, new RegExp(`export async function ${fn}`));
}

// 5. 404 honest state
assert.match(COMPANIES_MODULE, /res\.status === 404/);
assert.match(COMPANIES_MODULE, /not_registered/);
assert.match(COMPANIES_MODULE, /Not registered/);

// 6. runtimeReady + missing display
assert.match(COMPANIES_MODULE, /runtimeReady/);
assert.match(COMPANIES_MODULE, /humanizeMissingRequirement/);
assert.match(COMPANIES_MODULE, /Runtime not fully ready/);
assert.match(COMPANIES_MODULE, /Runtime ready/);

// 7. No token/secret inputs
assert.doesNotMatch(COMPANIES_MODULE, /accessToken|webhookSecret|WHATSAPP_TOKEN|type="password".*whatsapp/i);
assert.doesNotMatch(COMPANIES_MODULE, /id="wa(?:Register|Configure|Activate|Deactivate)[^"]*[Tt]oken/);

// 8. Production integration — no demo-data for card state
const cardLoader = COMPANIES_MODULE.slice(
  COMPANIES_MODULE.indexOf('async function loadWhatsAppIntegrationCard'),
  COMPANIES_MODULE.indexOf('function openWaModal')
);
assert.doesNotMatch(cardLoader, /DEMO_COMPANIES|loadDemoStore|demo-data/);
assert.match(cardLoader, /fetchPlatformWhatsAppIntegration/);

// 9. whatsappConnected not authority for new UI
assert.doesNotMatch(whatsappCellBlock, /whatsappConnected/);
assert.doesNotMatch(cardLoader, /whatsappConnected/);

// 10. Legacy checkbox removed from form
assert.doesNotMatch(COMPANIES_MODULE, /companyWhatsappConnected/);
assert.doesNotMatch(COMPANIES_MODULE, /companyWhatsappWebhook/);

// 11. normalizeCompanyItem passes whatsappIntegration
assert.match(COMPANIES_SERVICE, /whatsappIntegration:/);

// 12. Backend GET enrichment
assert.match(APP_JS, /getPlatformWhatsAppIntegrationWithReadiness/);
assert.match(APP_JS, /runtimeReady/);
assert.match(APP_JS, /missing/);

// 13. Agents untouched (this commit scope)
assert.doesNotMatch(COMPANIES_MODULE, /modules\/agents/);

// 14. RTB not mutated in tests
assert.doesNotMatch(COMPANIES_MODULE, new RegExp(`${RTB_ID}.*register|deactivate.*${RTB_ID}`));

// 15. Missing human labels
assert.ok(humanizeMissingRequirement('tenant_credentials_not_configured').includes('Tenant'));

console.log('All mission-control WhatsApp integration UI checks passed.');
