#!/usr/bin/env node
/**
 * PORTAL-UI-STYLING — Portal Styling Contract (regression guard).
 *
 * Usage:
 *   node scripts/verify-portal-ui-styling.mjs          # canonical css/
 *   node scripts/verify-portal-ui-styling.mjs --app    # + mirror app/css/
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkAppMirror = process.argv.includes('--app');

const ADMIN = 'css/admin-dashboard.css';
const PORTAL = 'css/company-portal.css';
const SARAH_MODULE = 'js/portal/modules/sarah.js';
const SARAH_UI = 'js/portal/sarah/sarah-ui.js';
const APPOINTMENTS = 'js/portal/modules/appointments.js';

const MIN_CSS_BYTES = 4096;

function read(rel) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    throw new Error(`Missing required file: ${rel}`);
  }
  const buf = readFileSync(abs);
  if (buf.length < MIN_CSS_BYTES && rel.endsWith('.css')) {
    throw new Error(`${rel} appears truncated (${buf.length} bytes)`);
  }
  return buf.toString('utf8');
}

function sha256(rel) {
  return createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex');
}

function assertBlock(css, label, pattern) {
  if (!pattern.test(css)) {
    throw new Error(`Portal Styling Contract: missing ${label}`);
  }
}

/** Class hooks emitted by Sarah modules (static template + classList). */
function extractSarahClassHooks() {
  const sarahJs = read(SARAH_MODULE);
  const sarahUi = read(SARAH_UI);
  const found = new Set();
  const re = /portal-sarah-[a-z0-9-]+/gi;
  for (const src of [sarahJs, sarahUi]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      found.add(m[0].toLowerCase());
    }
  }
  return [...found].sort();
}

function sarahHookCovered(portalCss, hook) {
  if (portalCss.includes(`.${hook}`)) return true;
  if (hook === 'portal-sarah-chat-mount--page') {
    return /\.portal-sarah-chat-mount--page/.test(portalCss);
  }
  if (hook === 'portal-sarah-chat-mount--widget') {
    return (
      portalCss.includes('.portal-sarah-chat-mount') && portalCss.includes('.portal-sarah-widget')
    );
  }
  return false;
}

function assertSarahHooksInCss(portalCss, hooks) {
  const missing = hooks.filter((hook) => !sarahHookCovered(portalCss, hook));
  if (missing.length) {
    throw new Error(
      `Sarah JS/CSS hook mismatch — no rule for:\n${missing.map((h) => `  .${h}`).join('\n')}`
    );
  }
}

function verifyAdminContract(adminCss) {
  assertBlock(adminCss, '--input-radius token', /--input-radius:\s*12px/);
  assertBlock(
    adminCss,
    'global form-control block',
    /\/\* ===== FORM CONTROLS \(global — rounded, modern\) ===== \*\//
  );
  assertBlock(
    adminCss,
    'global input/textarea/select border-radius',
    /textarea,\s*\nselect,\s*\ninput:not\(\[type="checkbox"\]\)[\s\S]*?border-radius:\s*var\(--input-radius\)/
  );
  assertBlock(
    adminCss,
    'textarea focus styling',
    /textarea:focus,[\s\S]*?box-shadow:\s*0 0 0 3px var\(--primary-glow\)/
  );
}

function verifyPortalContract(portalCss) {
  assertBlock(portalCss, '.portal-form-row', /\.portal-form-row\s*\{/);
  assertBlock(
    portalCss,
    '.portal-form-row direct inputs',
    /\.portal-form-row\s*>\s*input:not\(\[type="submit"\]\)/
  );

  assertBlock(portalCss, '.portal-sarah-page layout', /\.portal-sarah-page\s*\{/);
  assertBlock(portalCss, '.portal-sarah-page-aside', /\.portal-sarah-page-aside\s*\{/);
  assertBlock(portalCss, '.portal-sarah-cap-list', /\.portal-sarah-cap-list/);
  assertBlock(portalCss, '.portal-sarah-try-list', /\.portal-sarah-try-list/);
  assertBlock(portalCss, '.portal-sarah-msg bubbles', /\.portal-sarah-msg\s*\{/);
  assertBlock(portalCss, '.portal-sarah-chip', /\.portal-sarah-chip\s*\{/);
  assertBlock(portalCss, '.portal-sarah-form', /\.portal-sarah-form\s*\{/);
  assertBlock(
    portalCss,
    '.portal-sarah-form textarea',
    /\.portal-sarah-form textarea[\s\S]*?border-radius:\s*var\(--input-radius\)/
  );
  assertBlock(portalCss, '.portal-sarah-send', /\.portal-sarah-send\s*\{/);
  assertBlock(
    portalCss,
    'Sarah page chat mount',
    /\.portal-sarah-page-chat\.portal-sarah-chat-mount/
  );
  assertBlock(
    portalCss,
    'Sarah page textarea sizing',
    /\.portal-sarah-chat-mount--page \.portal-sarah-form textarea/
  );
}

function verifyMirror() {
  for (const rel of [ADMIN, PORTAL]) {
    const appRel = rel.replace(/^css\//, 'app/css/');
    if (!existsSync(path.join(root, appRel))) {
      throw new Error(`Missing generated mirror: ${appRel} (run prepare-sites.js app)`);
    }
    const a = sha256(rel);
    const b = sha256(appRel);
    if (a !== b) {
      throw new Error(`CSS mirror mismatch:\n  ${rel} ${a}\n  ${appRel} ${b}`);
    }
  }
}

function main() {
  read(ADMIN);
  read(PORTAL);

  const adminCss = read(ADMIN);
  const portalCss = read(PORTAL);

  verifyAdminContract(adminCss);
  verifyPortalContract(portalCss);

  const sarahHooks = extractSarahClassHooks();
  assertSarahHooksInCss(portalCss, sarahHooks);

  read(APPOINTMENTS);
  if (!read(APPOINTMENTS).includes('portal-form-row')) {
    throw new Error('Appointments module must use .portal-form-row (contract dependency)');
  }

  if (checkAppMirror) {
    verifyMirror();
  }

  console.log('verify-portal-ui-styling: PASS');
  console.log(`  ${ADMIN} sha256=${sha256(ADMIN)}`);
  console.log(`  ${PORTAL} sha256=${sha256(PORTAL)}`);
  console.log(`  Sarah class hooks covered: ${sarahHooks.length}`);
  if (checkAppMirror) {
    console.log(`  ${ADMIN.replace('css/', 'app/css/')} sha256=${sha256('app/css/admin-dashboard.css')}`);
    console.log(`  ${PORTAL.replace('css/', 'app/css/')} sha256=${sha256('app/css/company-portal.css')}`);
  }
}

main();
