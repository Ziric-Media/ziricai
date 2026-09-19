#!/usr/bin/env node
/** Mission Control console navigation + platform API wiring */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = [
  'js/admin/router.js',
  'js/admin/core/moduleRegistry.js',
  'js/admin/services/platformConsole.js',
  'services/operations/platformMissionControlService.js',
  'ziric-superadmin-console.html',
];

for (const rel of paths) {
  assert.ok(existsSync(join(ROOT, rel)), rel);
}

const router = readFileSync(join(ROOT, 'js/admin/router.js'), 'utf8');
const registry = readFileSync(join(ROOT, 'js/admin/core/moduleRegistry.js'), 'utf8');
const html = readFileSync(join(ROOT, 'ziric-superadmin-console.html'), 'utf8');
const app = readFileSync(join(ROOT, 'api/app.js'), 'utf8');

for (const page of ['crm', 'sarah', 'platformAnalytics', 'supportInbox', 'integrations', 'support']) {
  assert.match(router, new RegExp(page));
  assert.match(html, new RegExp(`data-page="${page}"`));
}

assert.match(app, /platform-executive-overview/);
assert.match(app, /operations\/sarah\/chat/);
assert.match(registry, /Companies/);

console.log('✓ Mission Control console wiring verified');
