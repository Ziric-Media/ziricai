#!/usr/bin/env node
/**
 * Sync source HTML/CSS/JS into marketing/, app/, and admin/ publish folders.
 * Run before Netlify deploy or after pulling changes: npm run prepare:sites
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolveWebFirebaseConfig } from '../js/firebase-config.js';
import { wrapMarketingPage } from './marketing-web-shell.js';
import { MARKETING_WEB_PAGES } from './marketing-web-pages.js';
import { renderMarketingNavLinks } from './marketing-nav.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(ROOT, '_sources');

/** Root HTML shells are edited at repo root; _sources copies must not win on mtime alone. */
const ROOT_PREFERRED_HTML = new Set([
  'ziric-superadmin-console.html',
  'company-portal.html',
  'ziricai.html',
]);

function sourcePath(name) {
  const fromSources = path.join(SOURCES, name);
  const fromRoot = path.join(ROOT, name);
  if (ROOT_PREFERRED_HTML.has(name) && fs.existsSync(fromRoot)) {
    return fromRoot;
  }
  if (fs.existsSync(fromSources) && fs.existsSync(fromRoot)) {
    const sourcesMtime = fs.statSync(fromSources).mtimeMs;
    const rootMtime = fs.statSync(fromRoot).mtimeMs;
    return rootMtime > sourcesMtime ? fromRoot : fromSources;
  }
  if (fs.existsSync(fromSources)) return fromSources;
  return fromRoot;
}

function readSource(name) {
  return fs.readFileSync(sourcePath(name), 'utf8');
}

const FIREBASE_IMPORTMAP_NODE = `"firebase/app": "./node_modules/firebase/app/dist/esm/index.esm.js",
        "firebase/auth": "./node_modules/firebase/auth/dist/esm/index.esm.js",
        "firebase/firestore": "./node_modules/firebase/firestore/dist/esm/index.esm.js",
        "firebase/storage": "./node_modules/firebase/storage/dist/esm/index.esm.js",
        "@firebase/app": "./node_modules/@firebase/app/dist/esm/index.esm.js",
        "@firebase/auth": "./node_modules/@firebase/auth/dist/esm/index.js",
        "@firebase/firestore": "./node_modules/@firebase/firestore/dist/index.esm.js",
        "@firebase/storage": "./node_modules/@firebase/storage/dist/index.esm.js",
        "@firebase/util": "./node_modules/@firebase/util/dist/index.esm.js",
        "@firebase/logger": "./node_modules/@firebase/logger/dist/esm/index.esm.js",
        "@firebase/component": "./node_modules/@firebase/component/dist/esm/index.esm.js",
        "@firebase/webchannel-wrapper/bloom-blob": "./node_modules/@firebase/webchannel-wrapper/dist/bloom-blob/esm/bloom_blob_es2018.js",
        "@firebase/webchannel-wrapper/webchannel-blob": "./node_modules/@firebase/webchannel-wrapper/dist/webchannel-blob/esm/webchannel_blob_es2018.js",
        "idb": "./node_modules/idb/build/index.js",
        "re2js": "./node_modules/re2js/build/index.esm.js"`;

/** Match package.json firebase version — gstatic shares one component registry across modules (esm.sh prefix does not). */
const FIREBASE_CDN_VERSION = '12.15.0';
const FIREBASE_GSTATIC = `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}`;
const FIREBASE_IMPORTMAP_CDN = `"firebase/app": "${FIREBASE_GSTATIC}/firebase-app.js",
        "firebase/auth": "${FIREBASE_GSTATIC}/firebase-auth.js",
        "firebase/firestore": "${FIREBASE_GSTATIC}/firebase-firestore.js",
        "firebase/storage": "${FIREBASE_GSTATIC}/firebase-storage.js"`;

const useCdnFirebase = process.env.NETLIFY === 'true' || process.env.USE_CDN_FIREBASE === 'true';

function firebaseConfigFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'ziricai';
  return resolveWebFirebaseConfig({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    databaseId: process.env.FIREBASE_DATABASE_ID || (projectId === 'ziricai' ? 'default' : '(default)'),
  });
}

/** Production API host (Railway). Override with PRODUCTION_API_URL env at build time. */
const PRODUCTION_API_URL =
  process.env.PRODUCTION_API_URL || 'https://ziricai-production.up.railway.app';

/** Deployment identity for Portal asset cache busting (Netlify build env). */
function resolveAssetVersion() {
  const ref = process.env.COMMIT_REF || process.env.CACHED_COMMIT_REF || '';
  let base = '';
  if (ref && ref !== 'true' && ref !== 'false') base = ref;
  else {
    try {
      base = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      base = 'dev';
    }
  }
  // Include CSS fingerprints so Netlify/browser caches bust when styles change without a new git SHA.
  try {
    const hasher = crypto.createHash('sha256');
    for (const name of ['admin-dashboard.css', 'company-portal.css']) {
      const cssPath = path.join(ROOT, 'css', name);
      if (fs.existsSync(cssPath)) hasher.update(fs.readFileSync(cssPath));
    }
    return `${base.slice(0, 12)}-${hasher.digest('hex').slice(0, 8)}`;
  } catch {
    return base;
  }
}

function siteConfigBlock(site) {
  const apiBase =
    process.env.API_BASE_URL !== undefined
      ? process.env.API_BASE_URL
      : site === 'marketing' || site === 'app' || site === 'admin'
        ? ''
        : '';
  const marketing = process.env.MARKETING_BASE_URL || 'https://marketing.ziricai.com';
  const publicWeb = process.env.PUBLIC_WEB_URL || process.env.ZIRICAI_ROOT_URL || 'https://ziricai.com';
  const app = process.env.APP_BASE_URL || 'https://app.ziricai.com';
  const admin = process.env.ADMIN_BASE_URL || 'https://admin.ziricai.com';
  return `<script>window.__ZIRICAI_CONFIG__=${JSON.stringify({
    apiBase,
    assetVersion: resolveAssetVersion(),
    sites: { marketing, publicWeb, app, admin, api: apiBase || PRODUCTION_API_URL },
    landingSarahCompanyId: process.env.LANDING_SARAH_COMPANY_ID || 'ziricai',
    firebase: firebaseConfigFromEnv(),
  })};</script>`;
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Logo + favicon.png for MC and portal; optional legacy SVG favicons for white-label hints. */
function copyPlatformBrandAssets(targetDir, extraAssetNames = []) {
  fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });
  const names = ['favicon.png', 'ZIRICAI LOGO.png', 'sarah-avatar.svg', ...extraAssetNames];
  for (const name of names) {
    const src = path.join(ROOT, 'assets', name);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(targetDir, 'assets', name));
    }
  }
}

function bumpBrandAssetUrls(html, assetVersion) {
  return html
    .replace(/assets\/ZIRICAI LOGO\.png(?!\?)/g, `assets/ZIRICAI LOGO.png?v=${assetVersion}`)
    .replace(/assets\/favicon\.png(?!\?)/g, `assets/favicon.png?v=${assetVersion}`)
    .replace(/assets\/sarah-avatar\.svg(?!\?)/g, `assets/sarah-avatar.svg?v=${assetVersion}`);
}

/** Legacy marketing pages still reference favicon-portal.svg in repo copies. */
function normalizePlatformFavicon(html) {
  return html.replace(
    /<link rel="icon" type="image\/svg\+xml" href="assets\/favicon-portal\.svg">/gi,
    '<link rel="icon" href="assets/favicon.png" type="image/png">\n    <link rel="apple-touch-icon" href="assets/favicon.png">'
  );
}

function readText(file) {
  return readSource(file);
}

function writeText(relPath, content) {
  const dest = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

/** Relative prefix from a published HTML file to site js/ (e.g. marketing/pricing/index.html → ../). */
function publishJsPrefix(publishPath) {
  const norm = String(publishPath).replace(/\\/g, '/');
  const m = norm.match(/^(marketing|app|admin)\/(.+)$/);
  if (!m) return './';
  const segments = m[2].split('/');
  if (segments.length <= 1) return './';
  return '../'.repeat(segments.length - 1);
}

const SHARED_BROWSER_TARGETS = [
  'js/shared',
  'marketing/js/shared',
  'app/js/shared',
  'admin/js/shared',
];

function writeSharedBrowserFile(filename, content) {
  for (const relDir of SHARED_BROWSER_TARGETS) {
    const dest = path.join(ROOT, relDir, filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
  }
}

/** Static sites have no services/ folder — sync canonical plans into js/shared for ES modules. */
function syncBillingPlansShared() {
  const canonical = path.join(ROOT, 'services/platform/billingPlans.js');
  if (!fs.existsSync(canonical)) {
    console.warn('Missing services/platform/billingPlans.js — skipping billingPlans sync');
    return;
  }
  let body = fs.readFileSync(canonical, 'utf8');
  body = body.replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/, '');
  const content = `/**
 * Browser ES module — billing plans for static deploys (app/admin/marketing).
 * Synced from services/platform/billingPlans.js by prepare-sites. Node/API uses services/ path.
 * Do not import from services/ in client bundles.
 */

${body}`;
  writeSharedBrowserFile('billingPlans.js', content);
}

/** IIFE for static HTML (marketing pricing cards) — embedded catalog synced from services/platform/billingPlans.js */
async function syncBillingPlansBrowser() {
  const canonicalPath = path.join(ROOT, 'services/platform/billingPlans.js');
  if (!fs.existsSync(canonicalPath)) {
    console.warn('Missing services/platform/billingPlans.js — skipping billingPlans.browser sync');
    return;
  }
  const mod = await import(pathToFileURL(canonicalPath).href);
  const fallbackPlans = Object.values(mod.BILLING_PLANS);
  const publicPlanIds = mod.PUBLIC_PLAN_IDS;

  const content = `/**
 * Browser build of billing plans — AUTO-GENERATED by prepare-sites from services/platform/billingPlans.js
 * Do not edit by hand; run: node scripts/prepare-sites.js
 */
(function (global) {
    'use strict';

    const FALLBACK_PLANS = ${JSON.stringify(fallbackPlans, null, 4)};

    const PUBLIC_PLAN_IDS = ${JSON.stringify(publicPlanIds)};

    let plans = FALLBACK_PLANS.slice();

    function getPlan(planId) {
        return plans.find((p) => p.id === planId) || plans.find((p) => p.id === 'trial') || FALLBACK_PLANS[0];
    }

    function getAllPlans() {
        return plans.slice();
    }

    function getPublicPlans() {
        return PUBLIC_PLAN_IDS.map((id) => getPlan(id));
    }

    function formatPrice(amount, currency, opts) {
        const suffix = (opts && opts.suffix) || '';
        if (amount == null) return 'Custom';
        if (Number(amount) === 0) return 'Free';
        const prefix = (currency || 'ZAR') === 'ZAR' ? 'R' : \`\${currency} \`;
        const num = Number(amount);
        let formatted;
        if (Number.isInteger(num)) {
            formatted = num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
        } else {
            const parts = num.toFixed(2).split('.');
            formatted = \`\${parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')}.\${parts[1]}\`;
        }
        return \`\${prefix}\${formatted}\${suffix}\`;
    }

    function getMinimumPlanPrice() {
        return getPlan('starter').price;
    }

    function formatPlanPriceLine(plan) {
        if (plan.price == null || plan.contactSales) {
            return \`\${plan.label} Custom pricing\`;
        }
        return \`\${plan.label} \${formatPrice(plan.price)}/month\`;
    }

    function getPricingSummaryText() {
        const planLines = getPublicPlans().map((plan) => {
            const pitch = plan.headline || plan.tagline || (plan.features && plan.features[0]) || plan.label;
            return \`\${formatPlanPriceLine(plan)} — \${pitch}\`;
        });
        return (
            \`Plans: \${planLines.join('; ')}. \` +
            'Start with Sarah on WhatsApp, then add Messenger, email, Instagram, and webchat as you grow. ' +
            'Every plan includes CRM, knowledge, automation, and a 14-day free trial.'
        );
    }

    function getDefaultPlatformReply() {
        return (
            'ZiricAI starts with Sarah on WhatsApp — then you add channels and AI Employees as your business grows. ' +
            \`Plans start at \${formatPrice(getMinimumPlanPrice())}/month with a 14-day free trial. \` +
            'Ask about channels, workspaces, conversations included, CRM, automation, or upgrading from Starter to Professional.'
        );
    }

    function setPlans(nextPlans) {
        if (Array.isArray(nextPlans) && nextPlans.length) {
            plans = nextPlans;
        }
    }

    async function refreshFromApi() {
        try {
            const res = await fetch('/api/billing/plans', { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const data = await res.json();
            if (Array.isArray(data.plans) && data.plans.length && data.plans.some((p) => p.headline)) {
                setPlans(data.plans);
                return true;
            }
        } catch {
            /* static hosting or offline — keep fallback */
        }
        return false;
    }

    global.ZiricBillingPlans = {
        getPlan,
        getAllPlans,
        getPublicPlans,
        formatPrice,
        getMinimumPlanPrice,
        getPricingSummaryText,
        getDefaultPlatformReply,
        refreshFromApi,
        PUBLIC_PLAN_IDS,
    };

    refreshFromApi();
})(typeof window !== 'undefined' ? window : globalThis);
`;

  writeSharedBrowserFile('billingPlans.browser.js', content);
}

/** Inline marketplace pack constants — static sites cannot import services/platform/*. */
function syncMarketplacePacksShared() {
  const src = path.join(ROOT, 'js/shared/marketplacePacks.js');
  if (!fs.existsSync(src)) {
    console.warn('Missing js/shared/marketplacePacks.js — skipping marketplacePacks sync');
    return;
  }
  let body = fs.readFileSync(src, 'utf8');
  if (body.includes('../../services/platform/')) {
    console.warn('js/shared/marketplacePacks.js still imports services/ — fix source before sync');
    return;
  }
  writeSharedBrowserFile('marketplacePacks.js', body);
}

const FIREBASE_IMPORTMAP_CDN_BLOCK = `<script type="importmap">
    {
      "imports": {
        ${FIREBASE_IMPORTMAP_CDN}
      }
    }
    </script>`;

function patchHtml(html, { site, importmapMode = useCdnFirebase ? 'cdn' : 'node', publishPath } = {}) {
  const jsPrefix = publishPath ? publishJsPrefix(publishPath) : './';
  let out = normalizePlatformFavicon(html);
  if (importmapMode === 'cdn') {
    out = out.replace(/<script type="importmap">[\s\S]*?<\/script>/, FIREBASE_IMPORTMAP_CDN_BLOCK);
  }

  out = out.replace(/ziricai\.html/g, 'index.html');
  out = out.replace(/company-portal\.html/g, 'index.html');
  out = out.replace(/ziric-superadmin-console\.html/g, 'index.html');

  if (site === 'marketing') {
    out = patchMarketingHomeNav(out);
    out = out.replace(/href="index\.html"/g, 'href="./"');
    out = out.replace(/href="index\.html#/g, 'href="./#');
    out = out.replace(/href="login\.html"/g, 'href="./login.html"');
    out = out.replace(/href="login\.html#/g, 'href="./login.html#');
    // Cross-site links in marketing footer
    out = out.replace(/href="index\.html" class="link-muted">Sign in/g, 'href="./login.html" class="link-muted">Sign in');
    out = out.replace(/href="company-portal\.html" class="link-muted">Sign in/g, 'href="./login.html" class="link-muted">Sign in');
    out = out.replace(/Platform Admin<\/a>/g, 'Platform Admin</a>');
    out = out.replace(/<a href="index\.html">Portal<\/a>/g, '<a href="#" data-site-link="app">Portal</a>');
    out = out.replace(/<a href="index\.html">Super Admin<\/a>/g, '<a href="#" data-site-link="admin">Super Admin</a>');
    out = out.replace(/<a href="index\.html">Platform Admin<\/a>/g, '<a href="#" data-site-link="admin">Platform Admin</a>');
    out = out.replace(/<a href="index\.html">Company Portal<\/a>/g, '<a href="#" data-site-link="app">Company Portal</a>');
    out = out.replace(/href="company-portal\.html"/g, 'href="./login.html"');
  }

  if (site === 'app') {
    const assetVersion = resolveAssetVersion();
    out = out.replace(
      /Platform admin\? Use <a href="[^"]*">Super Admin Console<\/a>/,
      'Platform admin? Use <a href="#" data-site-link="admin">Super Admin Console</a>'
    );
    out = out.replace(/href="login\.html" data-site-link="login"/g, 'href="#" data-site-link="login"');
    out = out.replace(
      /open http:\/\/localhost:3000\/index\.html/,
      'open http://localhost:3000/app/'
    );
    out = out.replace(
      /href="css\/admin-dashboard\.css"/,
      `href="css/admin-dashboard.css?v=${assetVersion}"`
    );
    out = out.replace(
      /href="css\/company-portal\.css"/,
      `href="css/company-portal.css?v=${assetVersion}"`
    );
    out = out.replace(
      /src="js\/portal\/main\.js"/,
      `src="js/portal/main.js?v=${assetVersion}"`
    );
  }

  if (site === 'admin') {
    const assetVersion = resolveAssetVersion();
    out = out.replace(/href="login\.html" data-site-link="login"/g, 'href="#" data-site-link="login"');
    out = out.replace(
      /open http:\/\/localhost:3000\/index\.html/,
      'open http://localhost:3000/admin/'
    );
    out = out.replace(/superadmin-register\.html/g, 'superadmin-register.html');
    out = out.replace(
      /href="css\/admin-dashboard\.css"/,
      `href="css/admin-dashboard.css?v=${assetVersion}"`
    );
    out = out.replace(
      /src="js\/admin\/main\.js"/,
      `src="js/admin/main.js?v=${assetVersion}"`
    );
  }

  if (out.includes('__ZIRICAI_CONFIG__')) {
    out = out.replace(
      /<script>window\.__ZIRICAI_CONFIG__=[^<]*<\/script>/,
      siteConfigBlock(site).trim()
    );
  } else {
    out = out.replace('</head>', `${siteConfigBlock(site)}\n</head>`);
  }

  if (site === 'admin' || site === 'app' || site === 'marketing') {
    out = bumpBrandAssetUrls(out, resolveAssetVersion());
  }

  if (out.includes('data-site-link') && !out.includes('getSiteUrls')) {
    out = out.replace('</body>', `<script type="module">
import { getSiteUrls, marketingLoginUrl } from '${jsPrefix}js/shared/siteUrls.js';
document.querySelectorAll('[data-site-link]').forEach((el) => {
  const key = el.getAttribute('data-site-link');
  if (key === 'login') {
    el.href = marketingLoginUrl();
    return;
  }
  const urls = getSiteUrls();
  if (urls[key]) el.href = urls[key];
});
</script>\n</body>`);
  }

  return out;
}

function patchMarketingHomeNav(html) {
  const navInner = renderMarketingNavLinks({ activePath: '/' });
  const headerPatched = html.replace(
    /<header class="landing-header site-header-v2">/,
    '<header class="landing-header site-header-v2 site-header-mega">'
  );
  return headerPatched.replace(
    /<nav class="nav-links" id="navLinks">[\s\S]*?<\/nav>/,
    `<nav class="nav-links nav-links-mega" id="navLinks">\n                ${navInner}\n            </nav>`
  ).replace(
    /<div class="nav-ctas">[\s\S]*?<\/div>\s*<\/div>\s*<\/header>/,
    `<div class="nav-ctas">
                <a href="/login.html" class="btn btn-sm btn-outline nav-cta-login">Login</a>
                <button type="button" class="btn btn-sm" onclick="launchWizard()">Start Free</button>
            </div>
        </div>
    </header>`
  );
}

function writeMarketingWebPages() {
  for (const page of MARKETING_WEB_PAGES) {
    const html = wrapMarketingPage({
      title: page.title,
      description: page.description,
      depth: page.depth,
      activePath: page.activePath,
      bodyHtml: page.bodyHtml,
      includePricing: page.includePricing,
      includeLanding: page.includeLanding,
      extraScript: page.extraScript || '',
    });
    const publishPath = `marketing/${page.outPath}`;
    writeText(publishPath, patchHtml(html, { site: 'marketing', importmapMode: 'cdn', publishPath }));
  }
}

/** Legacy paths that 301 to Wave 1 pages — do not publish static HTML (Netlify file wins over redirect). */
const MARKETING_LEGACY_HTML_SKIP = new Set(['industry-automotive.html']);

function prepareMarketing() {
  const dir = path.join(ROOT, 'marketing');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  // Static publish dirs never include node_modules — always use gstatic CDN importmap.
  writeText(
    'marketing/index.html',
    patchHtml(readText('ziricai.html'), { site: 'marketing', importmapMode: 'cdn', publishPath: 'marketing/index.html' })
  );
  writeMarketingWebPages();
  if (fs.existsSync(path.join(ROOT, 'login.html'))) {
    writeText(
      'marketing/login.html',
      patchHtml(readText('login.html'), { site: 'marketing', importmapMode: 'cdn', publishPath: 'marketing/login.html' })
    );
  }

  for (const name of fs.readdirSync(ROOT)) {
    if (name.startsWith('industry-') && name.endsWith('.html')) {
      if (MARKETING_LEGACY_HTML_SKIP.has(name)) continue;
      const publishPath = `marketing/${name}`;
      writeText(publishPath, patchHtml(readText(name), { site: 'marketing', importmapMode: 'cdn', publishPath }));
    }
  }

  for (const name of MARKETING_LEGACY_HTML_SKIP) {
    const legacyPath = path.join(dir, name);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
  }

  for (const name of fs.readdirSync(dir)) {
    if (MARKETING_LEGACY_HTML_SKIP.has(name)) continue;
    if (name.endsWith('.html') && name !== 'index.html' && name !== 'login.html') {
      const srcPath = path.join(dir, name);
      if (!fs.existsSync(srcPath)) continue;
      const raw = fs.readFileSync(srcPath, 'utf8');
      const publishPath = `marketing/${name}`;
      writeText(publishPath, patchHtml(raw, { site: 'marketing', importmapMode: 'cdn', publishPath }));
    }
  }

  copyDir(path.join(ROOT, 'js/onboarding'), path.join(dir, 'js/onboarding'));
  copyDir(path.join(ROOT, 'js/landing'), path.join(dir, 'js/landing'));
  copyDir(path.join(ROOT, 'js/shared'), path.join(dir, 'js/shared'));
  for (const f of ['auth.js', 'firebase-config.js', 'firebase.js', 'users.js', 'ziricai-landing.js', 'unified-login.js', 'marketing-site-nav.js']) {
    if (fs.existsSync(path.join(ROOT, 'js', f))) {
      copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
    }
  }

  for (const css of ['onboarding.css', 'ziricai-landing.css', 'admin-dashboard.css']) {
    copyFile(path.join(ROOT, 'css', css), path.join(dir, 'css', css));
  }

  copyPlatformBrandAssets(dir, ['favicon-portal.svg']);

  const apiTarget = process.env.PRODUCTION_API_URL || PRODUCTION_API_URL;
  const prettyUrlRedirects = [
    '/industry-automotive.html  /solutions/automotive/  301',
    '/pricing  /pricing/  301',
    '/platform  /platform/  301',
    '/platform/whatsapp  /platform/whatsapp/  301',
    '/platform/webchat  /platform/webchat/  301',
    '/platform/email  /platform/email/  301',
    '/platform/messenger  /platform/messenger/  301',
    '/platform/instagram  /platform/instagram/  301',
    '/platforms  /platform/  301',
    '/platforms/  /platform/  301',
    '/platforms/whatsapp  /platform/whatsapp/  301',
    '/platforms/whatsapp/  /platform/whatsapp/  301',
    '/platforms/webchat  /platform/webchat/  301',
    '/platforms/webchat/  /platform/webchat/  301',
    '/solutions  /solutions/  301',
    '/solutions/automotive  /solutions/automotive/  301',
    '/faq  /resources/faq/  301',
    '/faq/  /resources/faq/  301',
    '/resources/faq  /resources/faq/  301',
    '/resources/guides  /resources/guides/  301',
    '/resources/ai-resources  /resources/ai-resources/  301',
  ].join('\n');
  fs.writeFileSync(
    path.join(dir, '_redirects'),
    `# Generated by prepare-sites.js — API proxy when netlify.toml is not picked up on deploy\n/api/*  ${apiTarget}/api/:splat  200!\n/login  /login.html  301\n${prettyUrlRedirects}\n`,
    'utf8'
  );
}

function prepareApp() {
  const dir = path.join(ROOT, 'app');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  writeText('app/index.html', patchHtml(readText('company-portal.html'), { site: 'app', importmapMode: 'cdn' }));

  const marketingOnboarding = process.env.MARKETING_BASE_URL || 'https://marketing.ziricai.com';
  writeText(
    'app/onboarding.html',
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${marketingOnboarding}/#start">
  <title>Redirecting to onboarding…</title>
  <script>window.location.replace('${marketingOnboarding}/#start');</script>
</head>
<body><p>Redirecting to <a href="${marketingOnboarding}/#start">ZiricAI onboarding</a>…</p></body>
</html>`
  );

  copyDir(path.join(ROOT, 'js/portal'), path.join(dir, 'js/portal'));
  copyDir(path.join(ROOT, 'js/onboarding'), path.join(dir, 'js/onboarding'));
  copyDir(path.join(ROOT, 'js/shared'), path.join(dir, 'js/shared'));
  // Portal imports shared UI helpers from js/admin/ui.js — must exist on static app host.
  copyFile(path.join(ROOT, 'js/admin/ui.js'), path.join(dir, 'js/admin/ui.js'));
  copyFile(path.join(ROOT, 'js/admin/utils.js'), path.join(dir, 'js/admin/utils.js'));
  copyFile(path.join(ROOT, 'js/admin/demo-data.js'), path.join(dir, 'js/admin/demo-data.js'));
  copyFile(
    path.join(ROOT, 'js/admin/services/knowledgeDisplay.js'),
    path.join(dir, 'js/admin/services/knowledgeDisplay.js')
  );
  for (const f of ['auth.js', 'firebase-config.js', 'firebase.js', 'users.js']) {
    copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
  }

  for (const css of ['admin-dashboard.css', 'company-portal.css']) {
    copyFile(path.join(ROOT, 'css', css), path.join(dir, 'css', css));
  }
  copyPlatformBrandAssets(dir, ['favicon-portal.svg']);
}

function prepareAdmin() {
  const dir = path.join(ROOT, 'admin');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  writeText('admin/index.html', patchHtml(readText('ziric-superadmin-console.html'), { site: 'admin', importmapMode: 'cdn' }));

  for (const page of ['superadmin-register.html', 'register-admin.html', 'workspace-centralmotors.html']) {
    if (fs.existsSync(path.join(ROOT, page))) {
      writeText(`admin/${page}`, patchHtml(readText(page), { site: 'admin', importmapMode: 'cdn' }));
    }
  }

  copyDir(path.join(ROOT, 'js/admin'), path.join(dir, 'js/admin'));
  copyDir(path.join(ROOT, 'js/shared'), path.join(dir, 'js/shared'));
  for (const f of ['auth.js', 'firebase-config.js', 'firebase.js', 'users.js']) {
    copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
  }

  copyFile(path.join(ROOT, 'css/admin-dashboard.css'), path.join(dir, 'css/admin-dashboard.css'));
  copyPlatformBrandAssets(dir, ['favicon-superadmin.svg']);
}

const target = process.argv[2];
const runners = {
  marketing: prepareMarketing,
  app: prepareApp,
  admin: prepareAdmin,
};

async function main() {
  syncBillingPlansShared();
  await syncBillingPlansBrowser();
  syncMarketplacePacksShared();

  if (target && runners[target]) {
    runners[target]();
    if (target === 'app') {
      execSync('node scripts/verify-portal-ui-styling.mjs --app', { cwd: ROOT, stdio: 'inherit' });
    }
    console.log(`Prepared ${target}/`);
  } else {
    prepareMarketing();
    prepareApp();
    prepareAdmin();
    console.log('Prepared marketing/, app/, admin/');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
