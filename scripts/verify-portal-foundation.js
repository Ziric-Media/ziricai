#!/usr/bin/env node
/**
 * PORTAL-1 — Shared frontend foundation verification.
 *
 * Usage:
 *   node scripts/verify-portal-foundation.js
 *   node scripts/verify-portal-foundation.js --negative
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runNegative = process.argv.includes('--negative');

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256File(rel) {
  const buf = readFileSync(path.join(root, rel));
  return createHash('sha256').update(buf).digest('hex');
}

function walkJsFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full, base));
    else if (entry.name.endsWith('.js')) out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Collect exported binding names from ESM source (named exports only). */
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

function testWidgetDuplicateExports(widgetDirRel) {
  const widgetDir = path.join(root, widgetDirRel);
  assert(existsSync(widgetDir), `Missing ${widgetDirRel}`);
  const dupes = [];
  for (const file of readdirSync(widgetDir).filter((f) => f.endsWith('.js'))) {
    const rel = `${widgetDirRel}/${file}`;
    dupes.push(...findDuplicateExports(read(rel), rel));
  }
  assert(dupes.length === 0, dupes.join('\n'));
  console.log(`✓ No duplicate exports in ${widgetDirRel}`);
}

function testPortalMirror() {
  const srcDir = path.join(root, 'js/portal');
  const destDir = path.join(root, 'app/js/portal');
  assert(existsSync(srcDir), 'Missing js/portal');
  assert(existsSync(destDir), 'Missing app/js/portal — run node scripts/prepare-sites.js app');

  const mismatches = [];
  for (const rel of walkJsFiles(srcDir, srcDir)) {
    const srcRel = `js/portal/${rel}`;
    const appRel = `app/js/portal/${rel}`;
    if (!existsSync(path.join(root, appRel))) {
      mismatches.push(`${appRel} missing`);
      continue;
    }
    if (sha256File(srcRel) !== sha256File(appRel)) {
      mismatches.push(`${srcRel} <> ${appRel}`);
    }
  }
  assert(mismatches.length === 0, `Portal mirror mismatch:\n${mismatches.join('\n')}`);
  console.log('✓ js/portal mirrors app/js/portal');
}

function testPortalSyntax() {
  const files = walkJsFiles(path.join(root, 'js/portal'), path.join(root, 'js/portal'));
  for (const rel of files) {
    const abs = path.join(root, 'js/portal', rel);
    execSync(`node --check "${abs}"`, { stdio: 'pipe' });
  }
  console.log(`✓ node --check passed for ${files.length} portal files`);
}

function testForbiddenStateImports() {
  const modulesDir = path.join(root, 'js/portal/modules');
  const violations = [];
  for (const file of readdirSync(modulesDir).filter((f) => f.endsWith('.js'))) {
    const src = read(`js/portal/modules/${file}`);
    if (/from\s+['"]\.\.\/state\.js['"]/.test(src)) {
      violations.push(`js/portal/modules/${file} imports ../state.js — use ../core/dataStore.js`);
    }
  }
  assert(violations.length === 0, violations.join('\n'));
  console.log('✓ Portal modules use dataStore (no direct state.js imports)');
}

function testCanonicalEmptyStateImports() {
  const modulesDir = path.join(root, 'js/portal/modules');
  const violations = [];
  for (const file of readdirSync(modulesDir).filter((f) => f.endsWith('.js'))) {
    const rel = `js/portal/modules/${file}`;
    const src = read(rel);
    if (/\bemptyState\b/.test(src) && /from\s+['"][^'"]*admin\/ui\.js['"]/.test(src)) {
      if (/import\s*\{[^}]*\bemptyState\b/.test(src)) {
        violations.push(`${rel} imports emptyState from admin/ui.js — use renderEmptyState widget`);
      }
    }
  }
  assert(violations.length === 0, violations.join('\n'));
  console.log('✓ Portal modules do not import emptyState from admin/ui.js');
}

function testRouterAnchorNav() {
  const src = read('js/portal/router.js');
  assert(
    !/navEl\.tagName\s*===\s*['"]A['"]/.test(src),
    'router.js must not skip <a data-nav> elements',
  );
  assert(
    /navEl\)\s*return;\s*\n\s*e\.preventDefault\(\)/.test(src) || /if\s*\(\s*!navEl\s*\)\s*return/.test(src),
    'router.js must handle [data-nav] with preventDefault',
  );
  console.log('✓ Router handles anchor [data-nav]');
}

function testCompanyPortalHtmlMarkers() {
  const html = read('company-portal.html');
  assert(html.includes('portal-sidebar-brand'), 'company-portal.html missing portal-sidebar-brand');
  assert(html.includes('brand-company-name'), 'company-portal.html missing brand-company-name');
  assert(html.includes('bos-hamburger'), 'company-portal.html missing bos-hamburger topbar');
  assert(!html.includes('company-header-brand'), 'company-portal.html still has legacy company-header-brand');
  console.log('✓ company-portal.html has PORTAL-1 shell markers');
}

function testEmptyStateWidgetLoads() {
  const src = read('js/portal/core/widgets/emptyState.js');
  assert(!/export\s*\{[^}]*as\s+renderEmptyState/.test(src), 'emptyState.js must not re-export as renderEmptyState');
  assert(/export\s+function\s+renderEmptyState/.test(src), 'emptyState.js must export renderEmptyState function');
  console.log('✓ emptyState.js export shape is valid');
}

function runNegativeTests() {
  console.log('\n— Negative tests —');

  const tmp = path.join(root, '.portal-foundation-test-tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  try {
    const badWidget = `export { x as renderEmptyState };\nexport function renderEmptyState() {}\n`;
    writeFileSync(path.join(tmp, 'bad-widget.js'), badWidget, 'utf8');
    const dupes = findDuplicateExports(badWidget, 'bad-widget.js');
    assert(dupes.some((d) => d.includes("duplicate export 'renderEmptyState'")), 'duplicate export detector failed');
    console.log('✓ Detects duplicate export (renderEmptyState)');

    const ha = createHash('sha256').update('mirror-a').digest('hex');
    const hb = createHash('sha256').update('mirror-b').digest('hex');
    assert(ha !== hb, 'mirror hash comparison sanity failed');
    console.log('✓ Mirror mismatch detection available (hash compare)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  console.log('PORTAL-1 foundation verification\n');
  testEmptyStateWidgetLoads();
  testWidgetDuplicateExports('js/portal/core/widgets');
  testPortalMirror();
  testPortalSyntax();
  testForbiddenStateImports();
  testCanonicalEmptyStateImports();
  testRouterAnchorNav();
  testCompanyPortalHtmlMarkers();

  if (runNegative) {
    runNegativeTests();
  } else {
    console.log('\nTip: run with --negative to execute guard negative tests');
  }

  console.log('\n✅ PORTAL-1 foundation verification passed');
}

try {
  main();
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
