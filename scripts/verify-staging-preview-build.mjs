#!/usr/bin/env node
/**
 * Validate built portal index.html for Deploy Preview safety (read-only file parse).
 *
 * Usage:
 *   node scripts/verify-staging-preview-build.mjs app/index.html
 *
 * Optional env:
 *   STAGING_EXPECT_FIREBASE_PROJECT_ID=ziricai-staging
 *   STAGING_EXPECT_API_BASE_URL=https://your-staging.up.railway.app
 *   STAGING_FORBID_API_HOST=ziricai-production.up.railway.app
 *   NETLIFY_CONTEXT=deploy-preview  (when set, failures exit 1)
 */
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = process.argv[2] || 'app/index.html';
const abs = path.resolve(htmlPath);

if (!fs.existsSync(abs)) {
  console.error(`verify-staging-preview-build: file not found: ${abs}`);
  process.exit(1);
}

const html = fs.readFileSync(abs, 'utf8');
const match = html.match(/window\.__ZIRICAI_CONFIG__=({[\s\S]*?});<\/script>/);
if (!match) {
  console.error('verify-staging-preview-build: __ZIRICAI_CONFIG__ block not found (run prepare-sites.js app)');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(match[1]);
} catch (e) {
  console.error('verify-staging-preview-build: failed to parse __ZIRICAI_CONFIG__ JSON:', e.message);
  process.exit(1);
}

const errors = [];
const warnings = [];

const expectProject = process.env.STAGING_EXPECT_FIREBASE_PROJECT_ID?.trim();
const expectApi = process.env.STAGING_EXPECT_API_BASE_URL?.trim()?.replace(/\/$/, '');
const forbidHost =
  process.env.STAGING_FORBID_API_HOST?.trim() || 'ziricai-production.up.railway.app';

const apiBase = typeof cfg.apiBase === 'string' ? cfg.apiBase.replace(/\/$/, '') : cfg.apiBase;
const sitesApi =
  typeof cfg.sites?.api === 'string' ? cfg.sites.api.replace(/\/$/, '') : cfg.sites?.api;
const firebaseProject = cfg.firebase?.projectId;
const databaseId = cfg.firebase?.databaseId;

if (!firebaseProject) {
  errors.push('firebase.projectId missing');
} else if (expectProject && firebaseProject !== expectProject) {
  errors.push(`firebase.projectId expected "${expectProject}", got "${firebaseProject}"`);
}

if (firebaseProject === 'ziricai' && process.env.NETLIFY_CONTEXT === 'deploy-preview') {
  errors.push('Deploy Preview build still targets production Firebase project "ziricai"');
}

if (databaseId === undefined || databaseId === null || databaseId === '') {
  warnings.push('firebase.databaseId missing (staging ziricai-staging should use "(default)")');
}

function referencesForbiddenApi(url) {
  return typeof url === 'string' && url.includes(forbidHost);
}

if (!apiBase) {
  errors.push(
    'apiBase is empty — Netlify preview would proxy /api/* to production via app/netlify.toml'
  );
} else if (referencesForbiddenApi(apiBase)) {
  errors.push(`apiBase must not point at production Railway (${forbidHost})`);
}

if (referencesForbiddenApi(sitesApi)) {
  errors.push(`sites.api must not point at production Railway (${forbidHost})`);
}

if (expectApi && apiBase !== expectApi) {
  errors.push(`apiBase expected "${expectApi}", got "${apiBase || '(empty)'}"`);
}

console.log('verify-staging-preview-build');
console.log(`  file: ${abs}`);
console.log(`  firebase.projectId: ${firebaseProject ?? '(missing)'}`);
console.log(`  firebase.databaseId: ${databaseId ?? '(missing)'}`);
console.log(`  apiBase: ${apiBase || '(empty)'}`);
console.log(`  sites.api: ${sitesApi || '(empty)'}`);

for (const w of warnings) console.warn(`  WARN: ${w}`);
for (const e of errors) console.error(`  FAIL: ${e}`);

if (errors.length) {
  process.exit(1);
}

console.log('STAGING_PREVIEW_CONFIG_OK');
process.exit(0);
