#!/usr/bin/env node
/**
 * MC-U-1B — Mission Control Tenants UI (read-only classification).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyTenant,
  summarizeByClassification,
  TENANT_CLASS,
} from '../js/shared/tenantClassification.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIFIER_PATH = join(ROOT, 'js', 'shared', 'tenantClassification.js');
const COMPANIES_MODULE = join(ROOT, 'js', 'admin', 'modules', 'companies.js');
const REGISTRY = join(ROOT, 'js', 'admin', 'core', 'moduleRegistry.js');
const MAIN = join(ROOT, 'js', 'admin', 'main.js');
const CONSOLE_HTML = join(ROOT, 'ziric-superadmin-console.html');
const CENSUS_DEFAULT = join(ROOT, 'test-results', 'mc-u-0.1-tenant-census-2026-09-18.json');

console.log('verify-mission-control-tenants-ui');

// --- Static: classifier ---
assert.ok(existsSync(CLASSIFIER_PATH), 'js/shared/tenantClassification.js exists');
const classifierSrc = readFileSync(CLASSIFIER_PATH, 'utf8');
assert.doesNotMatch(classifierSrc, /firestore|Firestore|writeBatch|\.set\(|\.update\(/i);
assert.match(classifierSrc, /export function classifyTenant/);
assert.match(classifierSrc, /Never infers PRODUCTION CUSTOMER/i);

const companiesSrc = readFileSync(COMPANIES_MODULE, 'utf8');
const registrySrc = readFileSync(REGISTRY, 'utf8');
assert.match(companiesSrc, /tenantClassification\.js/);
assert.match(companiesSrc, /Tenant records — not production customer count/);
assert.match(companiesSrc, /tenant-class-filter/);
assert.match(companiesSrc, /nav-agents/);
assert.match(companiesSrc, /nav-knowledge/);
assert.match(companiesSrc, /nav-customers/);
assert.match(registrySrc, /companies: 'Tenants'/);
assert.match(registrySrc, /'companies'/);

const saveBlock = companiesSrc.slice(
  companiesSrc.indexOf('async function saveCompany'),
  companiesSrc.indexOf('async function saveCompany') + 2500
);
assert.doesNotMatch(saveBlock, /tenantClass|classificationSource|classificationConfidence|classification:/);

const mainSrc = readFileSync(MAIN, 'utf8');
assert.match(mainSrc, /All Tenants/);
assert.match(mainSrc, /not production customer count/i);

const htmlSrc = readFileSync(CONSOLE_HTML, 'utf8');
assert.match(htmlSrc, /data-page="companies"/);
assert.match(htmlSrc, /<span>Tenants<\/span>/);

const censusScriptPath = join(ROOT, 'scripts', 'mission-control-tenant-census-readonly.mjs');
if (existsSync(censusScriptPath)) {
  assert.doesNotMatch(readFileSync(censusScriptPath, 'utf8'), /tenantClassification/);
}

// --- Census fixture counts (MC-U-0.1) ---
const censusPath = process.env.MC_U_01_CENSUS || CENSUS_DEFAULT;
assert.ok(existsSync(censusPath), `census fixture missing: ${censusPath}`);
const census = JSON.parse(readFileSync(censusPath, 'utf8'));
const companies = [];
for (const arr of Object.values(census.grouped || {})) {
  for (const t of arr) {
    companies.push({
      id: t.companyId,
      name: t.name,
      ownerEmail: t.ownerEmail,
      status: t.status,
      plan: t.plan,
    });
  }
}
assert.equal(companies.length, 74, 'census grouped total');
const summary = summarizeByClassification(companies);
assert.equal(summary[TENANT_CLASS.PRODUCTION_CUSTOMER], 0);
assert.equal(summary[TENANT_CLASS.PILOT], 1);
assert.equal(summary[TENANT_CLASS.ACCEPTANCE], 2);
assert.equal(summary[TENANT_CLASS.DEMO_SHOWCASE], 2);
assert.equal(summary[TENANT_CLASS.TEST], 69);
assert.equal(summary[TENANT_CLASS.UNKNOWN], 0);

function filterCompanies(list, filters) {
  const term = (filters.search || '').toLowerCase();
  return list.filter((c) => {
    const matchesSearch = !term || [c.name, c.id, c.ownerEmail]
      .some((v) => String(v || '').toLowerCase().includes(term));
    const matchesPlan = !filters.plan || c.plan === filters.plan;
    const matchesStatus = !filters.status || c.status === filters.status;
    const { classification } = classifyTenant(c);
    const matchesClass = !filters.tenantClass || classification === filters.tenantClass;
    return matchesSearch && matchesPlan && matchesStatus && matchesClass;
  });
}

for (const cls of [
  TENANT_CLASS.PRODUCTION_CUSTOMER,
  TENANT_CLASS.PILOT,
  TENANT_CLASS.ACCEPTANCE,
  TENANT_CLASS.DEMO_SHOWCASE,
  TENANT_CLASS.TEST,
  TENANT_CLASS.UNKNOWN,
]) {
  const subset = filterCompanies(companies, { tenantClass: cls });
  assert.equal(subset.length, summary[cls], `filter ${cls}`);
  for (const row of subset) {
    assert.equal(classifyTenant(row).classification, cls);
  }
}
assert.equal(filterCompanies(companies, {}).length, 74);

const composed = filterCompanies(companies, {
  tenantClass: TENANT_CLASS.ACCEPTANCE,
  status: 'active',
  search: 'tp2c',
});
assert.equal(composed.length, 1);
assert.equal(composed[0].id, 'client2-tp2c-accept-20260917');

console.log('All MC-U-1B mission-control tenants UI checks passed.');
