#!/usr/bin/env node
/**
 * PORTAL-2E — Final Portal module regression guard (16 modules).
 *
 * Deterministic static/contract checks only. No browser simulation.
 * Chains prior PORTAL-2 gates (2D → 2C → foundation, 2B auth cases, 2A).
 *
 * Usage: node scripts/verify-portal-2e.js
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Record<string, string>} moduleId → human label */
const EXPECTED_LABELS = {
  dashboard: 'Overview',
  conversations: 'Inbox',
  customers: 'CRM',
  appointments: 'Appointments',
  agents: 'AI Employees',
  knowledge: 'Knowledge Base',
  automation: 'Automation',
  analytics: 'Analytics',
  marketplace: 'Marketplace',
  billing: 'Billing',
  integrations: 'Integrations',
  settings: 'Settings',
  notifications: 'Notifications',
  support: 'Support',
  team: 'Team',
  activity: 'Activity Log',
};

const EXPECTED_MODULE_IDS = Object.keys(EXPECTED_LABELS);

/** @type {Record<string, string>} moduleId → export name */
const EXPECTED_EXPORTS = {
  dashboard: 'renderDashboard',
  agents: 'renderAgents',
  knowledge: 'renderKnowledge',
  customers: 'renderCustomers',
  conversations: 'renderConversations',
  appointments: 'renderAppointments',
  automation: 'renderAutomation',
  analytics: 'renderAnalytics',
  marketplace: 'renderMarketplace',
  billing: 'renderBilling',
  integrations: 'renderIntegrations',
  settings: 'renderSettings',
  notifications: 'renderNotifications',
  support: 'renderSupport',
  team: 'renderTeam',
  activity: 'renderActivity',
};

/** Modules that load tenant data from the Portal API layer. */
const API_BACKED_MODULES = new Set([
  'dashboard',
  'conversations',
  'customers',
  'appointments',
  'agents',
  'knowledge',
  'automation',
  'analytics',
  'marketplace',
  'billing',
  'integrations',
  'notifications',
  'team',
  'activity',
]);

/** Static-only modules (no load-time API error surface required). */
const STATIC_MODULES = new Set(['support']);

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function collectExportNames(source) {
  const names = [];
  const fnRe = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let m;
  while ((m = fnRe.exec(source))) names.push(m[1]);
  const constRe = /export\s+(?:const|let|var|class)\s+(\w+)/g;
  while ((m = constRe.exec(source))) names.push(m[1]);
  const exportFromRe = /export\s*\{([^}]+)\}/g;
  while ((m = exportFromRe.exec(source))) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const exported = trimmed.includes(' as ')
        ? trimmed.split(/\s+as\s+/).pop().trim()
        : trimmed.split(/\s+/).pop().trim();
      if (exported) names.push(exported);
    }
  }
  return names;
}

function findDuplicateExports(source, fileLabel) {
  const names = collectExportNames(source);
  const seen = new Map();
  const dupes = [];
  for (const name of names) {
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) dupes.push(`${fileLabel}: duplicate export '${name}' (${count}x)`);
  }
  return dupes;
}

function parseLazyLoaderIds(source) {
  const block = source.match(/const MODULE_IDS = \[([\s\S]*?)\];/);
  assert(block, 'lazyLoader.js missing MODULE_IDS');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function parseExportMap(source) {
  const block = source.match(/const EXPORT_MAP = \{([\s\S]*?)\};/);
  assert(block, 'lazyLoader.js missing EXPORT_MAP');
  const map = {};
  for (const m of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseNavSectionIds(appShellSource) {
  return [
    ...appShellSource.matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'[^']+',\s*icon:/g),
  ].map((m) => m[1]);
}

function parseModulePermissionIds(permissionsSource) {
  return [...permissionsSource.matchAll(/^\s*(\w+):\s*(?:null|'[^']+'),?\s*$/gm)]
    .map((m) => m[1])
    .filter((id) => id !== 'export' && id !== 'const');
}

function resolveRelativeImport(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.dirname(path.join(ROOT, fromRel));
  let target = path.normalize(path.join(fromDir, spec));
  if (existsSync(target) && !target.endsWith('.js')) return target;
  if (existsSync(`${target}.js`)) return `${target}.js`;
  if (existsSync(path.join(target, 'index.js'))) return path.join(target, 'index.js');
  return target;
}

function collectImportSpecs(source) {
  const specs = [];
  const staticRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = staticRe.exec(source))) specs.push(m[1]);
  while ((m = dynamicRe.exec(source))) specs.push(m[1]);
  return specs;
}

console.log('verify-portal-2e — PORTAL module regression guard\n');

// ── 1. lazyLoader registration ─────────────────────────────────────────────
const lazyLoader = read('js/portal/core/lazyLoader.js');
const moduleIds = parseLazyLoaderIds(lazyLoader);
const exportMap = parseExportMap(lazyLoader);

assert.equal(moduleIds.length, 16, `Expected 16 MODULE_IDS, got ${moduleIds.length}`);
for (const id of EXPECTED_MODULE_IDS) {
  assert(moduleIds.includes(id), `MODULE_IDS missing '${id}'`);
}
assert.deepEqual(
  new Set(moduleIds),
  new Set(EXPECTED_MODULE_IDS),
  'MODULE_IDS must match the 16 registered Portal modules exactly',
);
assert.deepEqual(exportMap, EXPECTED_EXPORTS, 'EXPORT_MAP must match expected render exports');
console.log('✓ lazyLoader registers all 16 modules with correct export map');

// ── 2. Navigation + permissions alignment ──────────────────────────────────
const appShell = read('js/portal/core/appShell.js');
const navIds = parseNavSectionIds(appShell);
for (const id of navIds) {
  assert(moduleIds.includes(id), `NAV_SECTIONS item '${id}' not in MODULE_IDS`);
}
for (const id of EXPECTED_MODULE_IDS) {
  assert(navIds.includes(id), `MODULE '${id}' missing from NAV_SECTIONS`);
}
for (const [id, label] of Object.entries(EXPECTED_LABELS)) {
  assert(appShell.includes(`id: '${id}'`), `appShell missing nav item id '${id}'`);
  assert(appShell.includes(label), `appShell missing label '${label}' for '${id}'`);
}
console.log('✓ appShell NAV_SECTIONS covers all 16 modules');

const permissions = read('js/portal/permissions.js');
const permissionIds = parseModulePermissionIds(permissions);
for (const id of EXPECTED_MODULE_IDS) {
  assert(permissionIds.includes(id), `MODULE_PERMISSIONS missing '${id}'`);
}
console.log('✓ permissions.js defines all 16 module gates');

// ── 3. Module source files + exports ───────────────────────────────────────
const moduleDupes = [];
for (const id of EXPECTED_MODULE_IDS) {
  const rel = `js/portal/modules/${id}.js`;
  assert(existsSync(path.join(ROOT, rel)), `Missing module source ${rel}`);
  const src = read(rel);
  const exportName = EXPECTED_EXPORTS[id];
  assert(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportName}\\s*\\(`).test(src),
    `${rel} must export function ${exportName}`,
  );
  moduleDupes.push(...findDuplicateExports(src, rel));
}
assert(moduleDupes.length === 0, moduleDupes.join('\n'));
console.log('✓ All 16 module sources exist with expected render exports (no duplicate exports)');

// ── 4. Syntax ──────────────────────────────────────────────────────────────
for (const id of EXPECTED_MODULE_IDS) {
  const abs = path.join(ROOT, 'js/portal/modules', `${id}.js`);
  execSync(`node --check "${abs}"`, { stdio: 'pipe' });
}
console.log('✓ node --check passed for all 16 module files');

// ── 5. Portal state + empty-state contracts ────────────────────────────────
for (const id of EXPECTED_MODULE_IDS) {
  const rel = `js/portal/modules/${id}.js`;
  const src = read(rel);
  assert(
    !/from\s+['"]\.\.\/state\.js['"]/.test(src),
    `${rel} imports ../state.js — use ../core/dataStore.js`,
  );
  if (/\bemptyState\b/.test(src) && /from\s+['"][^'"]*admin\/ui\.js['"]/.test(src)) {
    assert(
      !/import\s*\{[^}]*\bemptyState\b/.test(src),
      `${rel} imports emptyState from admin/ui.js — use renderEmptyState widget`,
    );
  }
}
console.log('✓ Modules use dataStore (no direct state.js); no forbidden emptyState imports');

// ── 6. Import resolution (relative ESM paths) ──────────────────────────────
const importViolations = [];
for (const id of EXPECTED_MODULE_IDS) {
  const rel = `js/portal/modules/${id}.js`;
  for (const spec of collectImportSpecs(read(rel))) {
    if (!spec.startsWith('.')) continue;
    const resolved = resolveRelativeImport(rel, spec);
    if (!resolved || !existsSync(resolved)) {
      importViolations.push(`${rel}: unresolved import '${spec}'`);
    }
  }
}
assert(importViolations.length === 0, importViolations.join('\n'));
console.log('✓ Relative imports resolve for all 16 modules');

// ── 7. Portal API abstraction (no raw fetch / direct apiRequest in modules) ─
for (const id of EXPECTED_MODULE_IDS) {
  const rel = `js/portal/modules/${id}.js`;
  const src = read(rel);
  assert(!/\bfetch\s*\(/.test(src), `${rel} must not use raw fetch()`);
  assert(!/from\s+['"][^'"]*apiRequest\.js['"]/.test(src), `${rel} must use ../api.js, not apiRequest directly`);
  if (API_BACKED_MODULES.has(id)) {
    const usesPortalApi =
      /from\s+['"]\.\.\/api\.js['"]/.test(src) ||
      /from\s+['"]\.\.\/core\/dataService\.js['"]/.test(src);
    assert(usesPortalApi, `${rel} must import from ../api.js or ../core/dataService.js`);
  }
}
console.log('✓ API-backed modules use Portal API abstraction (no raw fetch/apiRequest)');

// ── 8. Error handling for API-backed modules ───────────────────────────────
for (const id of API_BACKED_MODULES) {
  const rel = `js/portal/modules/${id}.js`;
  const src = read(rel);
  assert(/errorState\s*\(/.test(src), `${rel} must surface API failures via errorState()`);
}

const settings = read('js/portal/modules/settings.js');
assert(/from\s+['"]\.\.\/api\.js['"]/.test(settings));
assert(/if\s*\(\s*result\.error\s*\)/.test(settings));
assert(/showToast\(\s*result\.error\s*,\s*['"]error['"]\s*\)/.test(settings));
console.log('✓ API-backed modules expose errorState; settings surfaces persistence failures');

assert(STATIC_MODULES.has('support'));
assert(!API_BACKED_MODULES.has('support'));
console.log('✓ Support module correctly classified as static (manual smoke only)');

// ── 9. Demo-boundary regression spot-checks (2B–2D contracts) ─────────────
const conversations = read('js/portal/modules/conversations.js');
const marketplace = read('js/portal/modules/marketplace.js');
const analytics = read('js/portal/modules/analytics.js');
const billing = read('js/portal/modules/billing.js');
const customers = read('js/portal/modules/customers.js');
const notifications = read('js/portal/modules/notifications.js');
const authGuard = read('js/portal/auth-guard.js');

assert.match(conversations, /shouldUseDemoFallback/);
assert.doesNotMatch(conversations, /hubData\?\.recentConversations/);
assert.match(marketplace, /if \(catalogRes\.error\)/);
assert.match(marketplace, /errorState\(catalogRes\.error\)/);
assert.match(analytics, /if \(res\.error && !useDemo\)/);
assert.match(billing, /usageSource === 'recorded'/);
assert.match(customers, /sessionStorage/);
assert.match(notifications, /markAllNotificationsRead/);
assert.match(notifications, /showToast\([^)]*error/);
assert.match(authGuard, /useDemoBranding/);
console.log('✓ Demo-boundary and persistence regression markers intact (2B–2D)');

// ── 10. Router references remain valid ─────────────────────────────────────
const router = read('js/portal/router.js');
assert(/loadModule\(page\)/.test(router));
assert(/MODULE_LABELS/.test(router));
assert(/portal-crm-selected/.test(router));
assert(!/navEl\.tagName\s*===\s*['"]A['"]/.test(router));
console.log('✓ Router loadModule/MODULE_LABELS/CRM session keys valid');

// ── 11. Foundation markers (quick spot-check; full suite chained below) ───
const html = read('company-portal.html');
assert(html.includes('portal-sidebar-brand'));
assert(html.includes('brand-company-name'));
assert(html.includes('id="sidebarNav"'));
console.log('✓ company-portal.html foundation shell markers present');

// ── 12. Chain prior PORTAL-2 verification gates ────────────────────────────
console.log('\n— Chaining prior PORTAL-2 gates —\n');
execSync('node scripts/verify-portal-2d.js', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/verify-portal-2b.js', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/verify-portal-2a.js', { cwd: ROOT, stdio: 'inherit' });

// ── Manual production smoke (not automatable here) ─────────────────────────
console.log('\n— Manual production smoke requirements (Central Motors) —');
console.log('  • Authenticated login as provisioned tenant (central-motors-rtb)');
console.log('  • Overview: hub loads; empty APIs show honest empty states, not demo data');
console.log('  • Inbox: conversation list from API; no hub demo substitution');
console.log('  • Activity + Notifications: empty → empty; API errors → error UI');
console.log('  • Billing: usageSource recorded; zeros where untracked; plan metadata from plan def');
console.log('  • Settings: branding persists after refresh; localStorage does not override server branding');
console.log('  • CRM: selected customer survives refresh within session');
console.log('  • Team invite: delivery remains pre-existing debt (not a regression blocker)');
console.log('  • Spot-check remaining modules load without console module-import failures');

console.log('\n— Remaining technical debt (documented, not PORTAL-2E blockers) —');
console.log('  • Firestore billing records may still contain seeded provisioning usage (hidden from Portal UI)');
console.log('  • Token/storage/API call meters show 0 until backend tracking exists');
console.log('  • Team invite email delivery stub');
console.log('  • buildUsageFromPlan() retained for demo/unprovisioned tenants only');

console.log('\n✅ All PORTAL-2E regression guard checks passed.');
console.log('   PORTAL-2 overall remains OPEN pending review + Central Motors production smoke.');
console.log('   PORTAL-3A remains LOCKED.');
