#!/usr/bin/env node
/**
 * B-MC-4e — Mission Control must not read legacy root Firestore analytics/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ADMIN_DIRS = [
  path.join(ROOT, 'js', 'admin'),
  path.join(ROOT, 'admin', 'js', 'admin'),
];

const SKIP_FILES = new Set(['demo-data.js']);

const FORBIDDEN_PATTERNS = [
  { pattern: /listDocuments\(\s*['"]analytics['"]/, label: "listDocuments('analytics')" },
  { pattern: /\blistAnalytics\s*\(/, label: 'listAnalytics()' },
  { pattern: /\bDEMO_ANALYTICS_ROWS\b/, label: 'DEMO_ANALYTICS_ROWS' },
  { pattern: /\bDEMO_ANALYTICS_SERIES\b/, label: 'DEMO_ANALYTICS_SERIES' },
];

function walkJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js') && !SKIP_FILES.has(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

console.log('verify-mission-control-analytics-cleanup');

const legacyDashboardPaths = [
  path.join(ROOT, 'js', 'admin', 'services', 'dashboard.js'),
  path.join(ROOT, 'admin', 'js', 'admin', 'services', 'dashboard.js'),
];

for (const legacyPath of legacyDashboardPaths) {
  assert.equal(
    fs.existsSync(legacyPath),
    false,
    `Legacy dashboard service must be removed: ${path.relative(ROOT, legacyPath)}`
  );
}

const schemaSource = fs.readFileSync(path.join(ROOT, 'services', 'database', 'schema.js'), 'utf8');
assert.match(schemaSource, /LEGACY_COLLECTIONS[\s\S]*ANALYTICS[\s\S]*deprecated|@deprecated B-MC-4e/i);

const violations = [];

for (const dir of ADMIN_DIRS) {
  for (const filePath of walkJsFiles(dir)) {
    const rel = path.relative(ROOT, filePath);
    const source = fs.readFileSync(filePath, 'utf8');
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${rel}: ${label}`);
      }
    }
  }
}

assert.equal(violations.length, 0, `Legacy analytics reads found:\n${violations.join('\n')}`);

const analyticsModule = fs.readFileSync(path.join(ROOT, 'js', 'admin', 'modules', 'analytics.js'), 'utf8');
assert.ok(analyticsModule.includes('loadTenantAnalytics'), 'Analytics page must use tenant metrics API');
assert.ok(analyticsModule.includes('loadTenantAnalyticsTimeSeries'), 'Analytics page must use tenant time-series API');

console.log('All Mission Control analytics cleanup checks passed.');
