#!/usr/bin/env node
/**
 * Sync source HTML/CSS/JS into marketing/, app/, and admin/ publish folders.
 * Run before Netlify deploy or after pulling changes: npm run prepare:sites
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(ROOT, '_sources');

function sourcePath(name) {
  const fromSources = path.join(SOURCES, name);
  const fromRoot = path.join(ROOT, name);
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

const FIREBASE_IMPORTMAP_CDN = `"firebase/app": "https://esm.sh/firebase@12.15.0/app",
        "firebase/auth": "https://esm.sh/firebase@12.15.0/auth",
        "firebase/firestore": "https://esm.sh/firebase@12.15.0/firestore",
        "firebase/storage": "https://esm.sh/firebase@12.15.0/storage"`;

const useCdnFirebase = process.env.NETLIFY === 'true' || process.env.USE_CDN_FIREBASE === 'true';

function siteConfigBlock(site) {
  const apiBase = process.env.API_BASE_URL || (site === 'marketing' || site === 'app' || site === 'admin' ? 'https://api.ziricai.com' : '');
  const marketing = process.env.MARKETING_BASE_URL || 'https://marketing.ziricai.com';
  const app = process.env.APP_BASE_URL || 'https://app.ziricai.com';
  const admin = process.env.ADMIN_BASE_URL || 'https://admin.ziricai.com';
  return `<script>window.__ZIRICAI_CONFIG__=${JSON.stringify({
    apiBase,
    sites: { marketing, app, admin, api: apiBase || 'https://api.ziricai.com' },
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

function readText(file) {
  return readSource(file);
}

function writeText(relPath, content) {
  const dest = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function patchHtml(html, { site, importmapMode = useCdnFirebase ? 'cdn' : 'node' } = {}) {
  let out = html;
  if (importmapMode === 'cdn') {
    out = out.replace(FIREBASE_IMPORTMAP_NODE, FIREBASE_IMPORTMAP_CDN);
    out = out.replace(/<script type="importmap">[\s\S]*?<\/script>/, (block) => {
      if (block.includes('esm.sh/firebase')) return block;
      return block.replace(FIREBASE_IMPORTMAP_NODE, FIREBASE_IMPORTMAP_CDN);
    });
  }

  out = out.replace(/ziricai\.html/g, 'index.html');
  out = out.replace(/company-portal\.html/g, 'index.html');
  out = out.replace(/ziric-superadmin-console\.html/g, 'index.html');

  if (site === 'marketing') {
    out = out.replace(/href="index\.html"/g, 'href="./"');
    out = out.replace(/href="index\.html#/g, 'href="./#');
    // Cross-site links in marketing footer
    out = out.replace(/href="index\.html" class="link-muted">Sign in/g, 'href="#" data-site-link="app" class="link-muted">Sign in');
    out = out.replace(/Platform Admin<\/a>/g, 'Platform Admin</a>');
    out = out.replace(/<a href="index\.html">Portal<\/a>/g, '<a href="#" data-site-link="app">Portal</a>');
    out = out.replace(/<a href="index\.html">Super Admin<\/a>/g, '<a href="#" data-site-link="admin">Super Admin</a>');
    out = out.replace(/<a href="index\.html">Platform Admin<\/a>/g, '<a href="#" data-site-link="admin">Platform Admin</a>');
    out = out.replace(/<a href="index\.html">Company Portal<\/a>/g, '<a href="#" data-site-link="app">Company Portal</a>');
  }

  if (site === 'app') {
    out = out.replace(
      /Platform admin\? Use <a href="index\.html">Super Admin Console<\/a>/,
      'Platform admin? Use <a href="#" data-site-link="admin">Super Admin Console</a>'
    );
    out = out.replace(
      /open http:\/\/localhost:3000\/index\.html/,
      'open http://localhost:3000/app/'
    );
  }

  if (site === 'admin') {
    out = out.replace(
      /open http:\/\/localhost:3000\/index\.html/,
      'open http://localhost:3000/admin/'
    );
    out = out.replace(/superadmin-register\.html/g, 'superadmin-register.html');
  }

  if (!out.includes('__ZIRICAI_CONFIG__')) {
    out = out.replace('</head>', `${siteConfigBlock(site)}\n</head>`);
  }

  if (!out.includes('data-site-link') && site === 'marketing') {
    out = out.replace('</body>', `<script type="module">
import { getSiteUrls } from './js/shared/siteUrls.js';
document.querySelectorAll('[data-site-link]').forEach((el) => {
  const key = el.getAttribute('data-site-link');
  const urls = getSiteUrls();
  if (urls[key]) el.href = urls[key];
});
</script>\n</body>`);
  }

  return out;
}

function prepareMarketing() {
  const dir = path.join(ROOT, 'marketing');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  writeText('marketing/index.html', patchHtml(readText('ziricai.html'), { site: 'marketing' }));

  for (const name of fs.readdirSync(ROOT)) {
    if (name.startsWith('industry-') && name.endsWith('.html')) {
      writeText(`marketing/${name}`, patchHtml(readText(name), { site: 'marketing' }));
    }
  }

  copyFile(path.join(ROOT, 'assets/favicon-portal.svg'), path.join(dir, 'assets/favicon-portal.svg'));

  copyDir(path.join(ROOT, 'js/onboarding'), path.join(dir, 'js/onboarding'));
  copyDir(path.join(ROOT, 'js/landing'), path.join(dir, 'js/landing'));
  copyDir(path.join(ROOT, 'js/shared'), path.join(dir, 'js/shared'));
  for (const f of ['auth.js', 'firebase.js', 'users.js', 'ziricai-landing.js']) {
    copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
  }

  for (const css of ['onboarding.css', 'ziricai-landing.css']) {
    copyFile(path.join(ROOT, 'css', css), path.join(dir, 'css', css));
  }
}

function prepareApp() {
  const dir = path.join(ROOT, 'app');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  writeText('app/index.html', patchHtml(readText('company-portal.html'), { site: 'app' }));

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
  for (const f of ['auth.js', 'firebase.js', 'users.js']) {
    copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
  }

  for (const css of ['admin-dashboard.css', 'company-portal.css']) {
    copyFile(path.join(ROOT, 'css', css), path.join(dir, 'css', css));
  }
  copyFile(path.join(ROOT, 'assets/favicon-portal.svg'), path.join(dir, 'assets/favicon-portal.svg'));
}

function prepareAdmin() {
  const dir = path.join(ROOT, 'admin');
  rmDir(path.join(dir, 'css'));
  rmDir(path.join(dir, 'js'));
  rmDir(path.join(dir, 'assets'));

  writeText('admin/index.html', patchHtml(readText('ziric-superadmin-console.html'), { site: 'admin' }));

  for (const page of ['superadmin-register.html', 'register-admin.html', 'workspace-centralmotors.html']) {
    if (fs.existsSync(path.join(ROOT, page))) {
      writeText(`admin/${page}`, patchHtml(readText(page), { site: 'admin' }));
    }
  }

  copyDir(path.join(ROOT, 'js/admin'), path.join(dir, 'js/admin'));
  copyDir(path.join(ROOT, 'js/shared'), path.join(dir, 'js/shared'));
  for (const f of ['auth.js', 'firebase.js', 'users.js']) {
    copyFile(path.join(ROOT, 'js', f), path.join(dir, 'js', f));
  }

  copyFile(path.join(ROOT, 'css/admin-dashboard.css'), path.join(dir, 'css/admin-dashboard.css'));
  copyFile(path.join(ROOT, 'assets/favicon-superadmin.svg'), path.join(dir, 'assets/favicon-superadmin.svg'));
}

const target = process.argv[2];
const runners = {
  marketing: prepareMarketing,
  app: prepareApp,
  admin: prepareAdmin,
};

if (target && runners[target]) {
  runners[target]();
  console.log(`Prepared ${target}/`);
} else {
  prepareMarketing();
  prepareApp();
  prepareAdmin();
  console.log('Prepared marketing/, app/, admin/');
}
