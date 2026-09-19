#!/usr/bin/env node
/**
 * MC-U-2C — Mission Control dashboard platform view + scope selector integration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD = join(ROOT, 'js', 'admin', 'modules', 'dashboard.js');
const OPS = join(ROOT, 'js', 'admin', 'services', 'operationsService.js');
const MAIN = join(ROOT, 'js', 'admin', 'main.js');

console.log('verify-mission-control-dashboard-platform-ui');

const dashboard = readFileSync(DASHBOARD, 'utf8');
const ops = readFileSync(OPS, 'utf8');
const main = readFileSync(MAIN, 'utf8');

assert.match(dashboard, /getPlatformDashboardView/);
assert.match(dashboard, /state\.selectedCompanyId/);
assert.match(dashboard, /renderPlatformDashboard/);
assert.match(dashboard, /tenant-summary-grid/);
assert.match(dashboard, /All tenants · tenant records/);
assert.doesNotMatch(dashboard, /getMetrics\(\)/);
assert.doesNotMatch(dashboard, /Live CRM · central-motors-rtb/);
assert.match(dashboard, /formatMetric/);

assert.match(ops, /getPlatformDashboardView/);
assert.match(ops, /platform-dashboard\?scope=platform/);
assert.match(ops, /scope=tenant/);
assert.match(ops, /portal_hub/);

assert.match(main, /All Tenants/);
assert.match(main, /selectedCompanyId/);
assert.match(main, /formatScopeOptionLabel/);

assert.match(dashboard, /openPilotTenant/);
assert.match(dashboard, /applyTenantScopeFromDashboard/);

const scopeDisplay = readFileSync(join(ROOT, 'js', 'admin', 'services', 'scopeDisplay.js'), 'utf8');
assert.match(scopeDisplay, /classifyTenant/);

const shell = readFileSync(join(ROOT, 'ziric-superadmin-console.html'), 'utf8');
assert.match(shell, /favicon-superadmin\.svg/);

console.log('✓ MC-U-2C dashboard platform view wiring verified');
