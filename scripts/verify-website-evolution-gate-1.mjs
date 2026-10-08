#!/usr/bin/env node
/**
 * Website Evolution Gate 1 Wave 1 — local acceptance (no deploy).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = path.join(ROOT, 'marketing');

const WAVE1_PAGES = [
  'index.html',
  'platform/index.html',
  'pricing/index.html',
  'resources/faq/index.html',
  'platform/whatsapp/index.html',
  'platform/webchat/index.html',
  'solutions/index.html',
  'solutions/automotive/index.html',
  'products/crm/index.html',
  'ai-employees/how-it-works/index.html',
];

const SHELL_MARKERS = [
  'site-header-v2',
  'site-footer',
  'id="sarahWidget"',
  'id="wizardView"',
  'launchWizard',
];

const TOUR_IDS = ['tourPhoneChat', 'tourPhoneTitle', 'tourStepTitle', 'tourNextBtn', 'tourPrevBtn'];

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
}

function fail(msg) {
  failures.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(M, rel), 'utf8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(M, rel));
}

/** Resolve href/src relative to HTML file location under marketing/. */
function resolveRef(fromHtmlRel, ref) {
  if (!ref || ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('#') || ref.startsWith('data:')) {
    return null;
  }
  let cleaned = ref.split('?')[0].split('#')[0];
  if (!cleaned || cleaned.startsWith('mailto:')) return null;
  if (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
    const rootCandidate = path.join(M, cleaned);
    if (fs.existsSync(rootCandidate)) return rootCandidate;
    if (fs.existsSync(rootCandidate + '.html')) return rootCandidate + '.html';
    if (fs.existsSync(path.join(rootCandidate, 'index.html'))) return path.join(rootCandidate, 'index.html');
    return rootCandidate;
  }
  const baseDir = path.dirname(path.join(M, fromHtmlRel));
  return path.normalize(path.join(baseDir, cleaned));
}

function checkAssetRefs(htmlRel, html) {
  const refs = [];
  for (const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) refs.push(m[1]);
  for (const ref of refs) {
    const abs = resolveRef(htmlRel, ref);
    if (!abs) continue;
    if (!abs.startsWith(M)) continue;
    const rel = path.relative(M, abs);
    if (rel.startsWith('..')) {
      fail(`${htmlRel}: broken ref ${ref}`);
      return;
    }
    if (!fs.existsSync(abs)) {
      fail(`${htmlRel}: missing asset ${ref} → ${rel}`);
    }
  }
}

console.log('Gate 1 Wave 1 — local acceptance\n');

try {
  execSync('node scripts/prepare-sites.js marketing', { cwd: ROOT, stdio: 'pipe' });
  pass('prepare-sites marketing exits 0');
} catch (e) {
  fail('prepare-sites marketing failed: ' + (e.stderr?.toString() || e.message));
}

for (const page of WAVE1_PAGES) {
  if (fileExists(page)) pass(`published: ${page}`);
  else fail(`missing page: ${page}`);
}

if (!fileExists('industry-automotive.html')) {
  pass('legacy industry-automotive.html omitted (301 to /solutions/automotive/)');
} else {
  fail('industry-automotive.html must not publish — breaks Netlify 301');
}

const redirects = read('_redirects');
if (redirects.includes('/industry-automotive.html  /solutions/automotive/  301')) {
  pass('_redirects: automotive 301');
} else {
  fail('_redirects: missing industry-automotive → solutions/automotive 301');
}

const toml = fs.readFileSync(path.join(M, 'netlify.toml'), 'utf8');
const spaIdx = toml.indexOf('from = "/*"');
const prettyIdx = toml.indexOf('/platform/');
if (prettyIdx >= 0 && spaIdx >= 0 && prettyIdx < spaIdx) {
  pass('netlify.toml: pretty URL redirects before SPA fallback');
} else {
  fail('netlify.toml: redirect ordering (pretty URLs must precede /* → index.html)');
}

for (const page of WAVE1_PAGES.filter((p) => p !== 'index.html')) {
  const html = read(page);
  for (const marker of SHELL_MARKERS) {
    if (!html.includes(marker)) fail(`${page}: missing shell marker "${marker}"`);
  }
  if (SHELL_MARKERS.every((m) => html.includes(m))) pass(`${page}: shared shell markers present`);
  checkAssetRefs(page, html);
}

const pricingHtml = read('pricing/index.html');
if (
  pricingHtml.includes('billingPlans.browser.js') &&
  pricingHtml.includes('pricing-landing.browser.js') &&
  /\bpricing-grid\b/.test(pricingHtml)
) {
  pass('pricing/: canonical billingPlans + pricing-landing + .pricing-grid');
} else {
  fail('pricing/: missing canonical pricing scripts or grid');
}

const waHtml = read('platform/whatsapp/index.html');
if (TOUR_IDS.every((id) => waHtml.includes(`id="${id}"`) || waHtml.includes(`id='${id}'`))) {
  pass('platform/whatsapp/: tour DOM IDs preserved');
} else {
  fail('platform/whatsapp/: missing tour IDs');
}
if (waHtml.includes('ziricai-landing.js')) pass('platform/whatsapp/: loads ziricai-landing.js');

const webHtml = read('platform/webchat/index.html');
if (webHtml.includes('id="sarahBubble"') && webHtml.includes('id="sarahForm"')) {
  pass('platform/webchat/: Sarah widget DOM present');
} else {
  fail('platform/webchat/: Sarah widget incomplete');
}

const autoHtml = read('solutions/automotive/index.html');
for (const phrase of ['Car Dealer Pack', 'Stock enquiries', 'Test drive booking', 'Trade-in valuations']) {
  if (!autoHtml.includes(phrase)) fail(`solutions/automotive/: missing "${phrase}"`);
}
if (['Car Dealer Pack', 'Stock enquiries', 'Test drive booking'].every((p) => autoHtml.includes(p))) {
  pass('solutions/automotive/: industry content intact');
}

const home = read('index.html');
if (home.includes('id="hero"') && home.includes('Put Them to Work')) {
  pass('home: hero + primary headline present');
} else {
  fail('home: hero headline missing');
}
if (home.includes('id="trust-stats"') && home.includes('id="differentiator"')) {
  pass('home: trust bar + differentiator sections');
} else {
  fail('home: missing trust/differentiator sections');
}
if (home.includes('nav-links-mega') && home.includes('nav-dropdown')) pass('home: mega-menu nav (logo = home)');
else fail('home: missing mega-menu nav');
if (home.includes('id="product-tour"') && home.includes('id="tourPhoneChat"')) {
  pass('home: product tour / demo phone UI present');
} else {
  fail('home: product tour missing');
}
if (home.includes('login.html') || home.includes('./login.html')) pass('home: login link present');
if (home.includes('id="sarahWidget"')) pass('home: Sarah widget present');

checkAssetRefs('index.html', home);

const nestedPages = WAVE1_PAGES.filter((p) => p.includes('/'));
const nestedOk = nestedPages.every(
  (p) => !failures.some((f) => f.includes(p) && (f.includes('missing asset') || f.includes('broken ref')))
);
if (nestedOk) pass('nested routes: no broken JS/CSS/image path failures detected');

console.log(`\n✅ Passed (${passes.length}):`);
for (const p of passes) console.log('  · ' + p);

if (failures.length) {
  console.log(`\n❌ Failed (${failures.length}):`);
  for (const f of failures) console.log('  · ' + f);
  process.exit(1);
}

console.log('\nGate 1 Wave 1 local acceptance: PASS (ready for Implementation Acceptance gate review)');
process.exit(0);
