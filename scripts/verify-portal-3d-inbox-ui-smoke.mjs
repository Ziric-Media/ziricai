#!/usr/bin/env node
/**
 * PORTAL-3D — Inbox UI wiring smoke (static + production API contract).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_WEB_CONFIG } from '../js/firebase-config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://ziricai-production.up.railway.app';
const COMPANY_ID = 'central-motors-rtb';
const credPath = join(ROOT, '.portal-rtb-smoke-credentials.json');

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

async function firebaseToken(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Firebase auth failed');
  return data.idToken;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function apiPost(token, path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

console.log('verify-portal-3d-inbox-ui-smoke');

const conversations = read('js/portal/modules/conversations.js');
const inboxUi = read('js/portal/modules/inbox-ui.js');
const apiJs = read('js/portal/api.js');

assert.match(conversations, /from '\.\/inbox-ui\.js'/);
assert.match(conversations, /markConversationRead/);
assert.match(conversations, /detail\.data\?\.context/);
assert.match(conversations, /shouldUseDemoFallback/);
assert.doesNotMatch(conversations, /localStorage/);
assert.doesNotMatch(inboxUi, /renderSendAllModal/);
assert.doesNotMatch(inboxUi, /Send to All/);
assert.doesNotMatch(inboxUi, /buildCrmLookup/);
assert.match(inboxUi, /renderCustomerContextPanel/);
assert.match(inboxUi, /inbox-layout-3col/);
assert.match(inboxUi, /Release to AI/);
assert.match(inboxUi, /message\.createdAt/);
assert.match(inboxUi, /mobileShowProfileBtn/);
assert.match(apiJs, /markConversationRead/);
console.log('✓ Static wiring: controller + presentation + mark-read API helper');

assert.match(inboxUi, /AI Assistant/);
assert.doesNotMatch(inboxUi, /['"]Sarah['"]/);
console.log('✓ No hardcoded Sarah in inbox presentation');

if (!fs.existsSync(credPath)) {
  console.log('(Skipping live API smoke — missing .portal-rtb-smoke-credentials.json)');
  process.exit(0);
}

const creds = JSON.parse(fs.readFileSync(credPath, 'utf8').replace(/^\uFEFF/, ''));
const token = await firebaseToken(creds.email, creds.password);

const list = await apiGet(token, `/api/companies/${COMPANY_ID}/conversations`);
assert.equal(list.status, 200);
assert.ok(Array.isArray(list.data?.items));
console.log(`✓ Live: conversation list → ${list.data.items.length} items`);

const conv = list.data.items[0];
assert.ok(conv?.id || conv?.phone, 'expected at least one conversation');
const convId = encodeURIComponent(conv.id || conv.phone);

const detail = await apiGet(token, `/api/companies/${COMPANY_ID}/conversations/${convId}`);
assert.equal(detail.status, 200);
assert.ok(Array.isArray(detail.data?.messages));
assert.ok(detail.data?.context);
assert.ok(detail.data.messages.length > 0);
assert.ok(detail.data.messages.every((m) => m.createdAt && m.source && m.role));
console.log('✓ Live: detail exposes messages + context + 3C contract fields');

const sources = new Set(detail.data.messages.map((m) => m.source));
assert.ok(sources.has('customer'));
console.log('✓ Live: customer message source present');

if (detail.data.context?.aiEmployee?.name) {
  console.log(`✓ Live: AI employee name from context → ${detail.data.context.aiEmployee.name}`);
}

const readRes = await apiPost(token, `/api/companies/${COMPANY_ID}/conversations/${convId}/read`);
assert.equal(readRes.status, 200);
assert.equal(readRes.data?.unread, false);
console.log('✓ Live: mark-read persists unread:false');

console.log('\nAll PORTAL-3D inbox UI smoke checks passed.');
