#!/usr/bin/env node
/**
 * B-MC-5a — production Companies list is Firestore-authoritative;
 * WhatsApp display is integration-derived; links require platform auth.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import {
  applyWhatsAppDisplayFromIntegration,
  platformCompanyDirectorySource,
} from '../services/tenants/companyService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = readFileSync(join(ROOT, 'api', 'app.js'), 'utf8');
const COMPANIES_SERVICE = readFileSync(join(ROOT, 'js', 'admin', 'services', 'companies.js'), 'utf8');
const COMPANIES_MODULE = readFileSync(join(ROOT, 'js', 'admin', 'modules', 'companies.js'), 'utf8');

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

function extractRouteHandler(source, routeLiteral) {
  const idx = source.indexOf(routeLiteral);
  assert.notEqual(idx, -1, `Missing route: ${routeLiteral}`);
  return source.slice(idx, idx + 900);
}

console.log('verify-mission-control-companies-scope');

withMode('production', () => {
  assert.equal(isDemoDataAllowed(), false);

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
        name: 'Central Motors Rustenburg',
        whatsappConnected: true,
      }],
      source: 'firestore',
    },
  });
  assert.equal(ok.loadState, 'ok');
  assert.equal(ok.items[0].id, 'central-motors-rtb');
  assert.equal(ok.items[0].name, 'Central Motors Rustenburg');
  assert.equal(ok.items[0].whatsappConnected, true);

  const both = resolveAdminCompaniesList({
    data: {
      items: [
        { id: 'central-motors-rtb', name: 'Central Motors Rustenburg' },
        { id: 'demo-central-motors', name: 'Central Motors', whatsappConnected: false },
      ],
      source: 'firestore',
    },
  });
  assert.equal(both.items.length, 2);
  assert.ok(both.items.some((c) => c.id === 'demo-central-motors'));
});

withMode('development', () => {
  assert.equal(isDemoDataAllowed(), true);
});

assert.equal(platformCompanyDirectorySource('firestore'), 'firestore');
assert.equal(platformCompanyDirectorySource('memory'), 'memory');

const listHandler = extractRouteHandler(APP_JS, 'app.get("/api/platform/companies", requirePlatformAccess()');
assert.match(listHandler, /listAllCompaniesFromStorage\(\)/);
assert.doesNotMatch(listHandler, /listPlatformCompanies\(/);
assert.match(listHandler, /platformCompanyDirectorySource/);
assert.doesNotMatch(APP_JS, /listPlatformCompanies/);
assert.doesNotMatch(APP_JS, /getPlatformCompany/);

assert.match(
  COMPANIES_SERVICE,
  /fetchPlatformCompanies/,
  'Companies page must call GET /api/platform/companies'
);
assert.match(COMPANIES_SERVICE, /if \(!isDemoDataAllowed\(\)\)/);
assert.match(COMPANIES_SERVICE, /loadState: items\.length \? 'ok' : 'empty'/);
assert.match(COMPANIES_SERVICE, /ziricai-demo-companies/, 'demo localStorage key exists for development only');
const prodListBlock = COMPANIES_SERVICE.slice(
  COMPANIES_SERVICE.indexOf('export async function listCompanies()'),
  COMPANIES_SERVICE.indexOf('export async function getCompany(')
);
assert.match(prodListBlock, /if \(!isDemoDataAllowed\(\)\) \{[\s\S]*return \{[\s\S]*source: 'api'/);
assert.doesNotMatch(
  prodListBlock.split('if (!isDemoDataAllowed())')[1].split('if (!api.error')[0],
  /loadDemoStore|DEMO_COMPANIES|localStorage/,
  'production list path must not use demo-data.js or localStorage'
);
assert.match(
  COMPANIES_MODULE,
  /isDemoDataAllowed\(\)[\s\S]{0,80}resolveListItems\(result, DEMO_COMPANIES\)[\s\S]{0,40}: \(result\.items \|\| \[\]\)/,
  'production Companies page must render API items, not demo-data.js'
);

const rtb = applyWhatsAppDisplayFromIntegration(
  {
    id: 'central-motors-rtb',
    name: 'Central Motors Rustenburg',
    whatsappConnected: false,
  },
  { companyId: 'central-motors-rtb', status: 'active', displayPhoneNumber: '' }
);
assert.equal(rtb.whatsappConnected, true, 'RTB active integration must display connected');

const rtbConnectedAlias = applyWhatsAppDisplayFromIntegration(
  { id: 'central-motors-rtb', whatsappConnected: false },
  { companyId: 'central-motors-rtb', status: 'connected' }
);
assert.equal(rtbConnectedAlias.whatsappConnected, true);

const falsePositive = applyWhatsAppDisplayFromIntegration(
  {
    id: 'orphan-tenant',
    whatsappConnected: true,
    whatsappNumber: '+27000000000',
  },
  null
);
assert.equal(
  falsePositive.whatsappConnected,
  false,
  'company-root whatsappConnected=true must not display Connected without an integration'
);

const inactive = applyWhatsAppDisplayFromIntegration(
  { id: 'orphan-tenant', whatsappConnected: true },
  { companyId: 'orphan-tenant', status: 'disconnected' }
);
assert.equal(inactive.whatsappConnected, false);

const demo = applyWhatsAppDisplayFromIntegration(
  { id: 'demo-central-motors', name: 'Central Motors', whatsappConnected: true },
  null
);
assert.equal(demo.whatsappConnected, false, 'demo tenant without integration is not connected');

const isolated = applyWhatsAppDisplayFromIntegration(
  { id: 'demo-central-motors', whatsappConnected: true },
  { companyId: 'central-motors-rtb', status: 'active' }
);
assert.equal(
  isolated.whatsappConnected,
  false,
  'another tenant integration must not mark this company connected'
);

const linksHandler = extractRouteHandler(
  APP_JS,
  'app.get("/api/platform/companies/:companyId/links"'
);
assert.match(
  linksHandler,
  /requirePlatformAccess\(\)/,
  'GET /api/platform/companies/:companyId/links must require platform auth'
);

console.log('All mission-control companies scope checks passed.');
