#!/usr/bin/env node
/**
 * REAL-CLIENT-1 — Bind john@centralmotors.co.za to central-motors-rtb (owner).
 * Narrow identity migration only. Mutates ONLY users/{uid} + companies/RTB/users/{uid}.
 *
 * Usage (production credentials):
 *   npx @railway/cli run node scripts/real-client-1-bind-john-central-motors-rtb.mjs
 *
 * Optional API smoke (requires known password — never logged):
 *   JOHN_CENTRAL_MOTORS_PASSWORD=... npx @railway/cli run node scripts/real-client-1-bind-john-central-motors-rtb.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const TARGET_EMAIL = 'john@centralmotors.co.za';
const TARGET_UID = 'toUXzw4ZhPPqVI6KXVTSGvi3h8e2';
const COMPANY_ID = 'central-motors-rtb';
const DEMO_ID = 'demo-central-motors';
const FULL_NAME = 'John Smith';

const API_BASE = (process.env.RC1_API_BASE || 'https://ziricai-production.up.railway.app').replace(/\/$/, '');

const report = {
  gate: 'REAL-CLIENT-1-CENTRAL-MOTORS-IDENTITY-BINDING',
  firebaseAuth: null,
  before: {},
  after: {},
  demoTenantUnchanged: null,
  apiSmoke: null,
  ok: false,
  error: null,
};

function stop(msg) {
  report.error = msg;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

async function readProfileAndMembership(db, uid) {
  const profileSnap = await db.collection('users').doc(uid).get();
  const memberSnap = await db.collection('companies').doc(COMPANY_ID).collection('users').doc(uid).get();
  return {
    profileExists: profileSnap.exists,
    profile: profileSnap.exists ? profileSnap.data() : null,
    membershipExists: memberSnap.exists,
    membership: memberSnap.exists ? memberSnap.data() : null,
  };
}

async function snapshotDemoCompany(db) {
  const snap = await db.collection('companies').doc(DEMO_ID).get();
  if (!snap.exists) return { exists: false };
  const d = snap.data();
  return {
    exists: true,
    name: d.name || null,
    status: d.status || null,
    updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
  };
}

async function firebaseToken(email, password) {
  const { PRODUCTION_WEB_CONFIG } = await import('../js/firebase-config.js');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message || 'Firebase sign-in failed');
  return data.idToken;
}

async function apiGet(path, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: res.status, data };
}

async function main() {
  process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'firestore';

  const { hasAdminCredentials, getAdminFirestore } = await import('../services/database/firestoreAdmin.js');
  const { upsertGlobalUserProfile, upsertOwnerMembership } = await import('../services/auth/authService.js');

  if (!hasAdminCredentials()) stop('NO_ADMIN_CREDENTIALS');

  getAdminFirestore();
  if (!admin.apps.length) stop('FIREBASE_ADMIN_UNAVAILABLE');

  let authUser;
  try {
    authUser = await admin.auth().getUser(TARGET_UID);
  } catch (err) {
    stop(`Firebase Auth UID lookup failed: ${err.message}`);
  }

  const authEmail = String(authUser.email || '').trim().toLowerCase();
  if (authEmail !== TARGET_EMAIL) {
    stop(`UID email mismatch: expected ${TARGET_EMAIL}, got ${authEmail || '(empty)'}`);
  }

  report.firebaseAuth = { uid: TARGET_UID, email: authEmail, emailVerified: authUser.emailVerified };

  const db = getAdminFirestore();
  const companySnap = await db.collection('companies').doc(COMPANY_ID).get();
  if (!companySnap.exists) stop(`Target company missing: ${COMPANY_ID}`);

  report.centralMotorsCompany = {
    id: COMPANY_ID,
    name: companySnap.data()?.name || null,
    status: companySnap.data()?.status || null,
  };

  report.before.demoSnapshot = await snapshotDemoCompany(db);
  report.before.identity = await readProfileAndMembership(db, TARGET_UID);

  const emailQuery = await db.collection('users').where('email', '==', TARGET_EMAIL).limit(5).get();
  const otherProfiles = emailQuery.docs.filter((d) => d.id !== TARGET_UID);
  if (otherProfiles.length) {
    stop(
      `Conflicting users docs for email ${TARGET_EMAIL}: ${otherProfiles.map((d) => d.id).join(', ')}`
    );
  }

  if (report.before.identity.profile?.companyId && report.before.identity.profile.companyId !== COMPANY_ID) {
    stop(
      `Profile already bound to ${report.before.identity.profile.companyId}; manual review required`
    );
  }

  await upsertGlobalUserProfile(TARGET_UID, {
    email: TARGET_EMAIL,
    fullName: FULL_NAME,
    name: FULL_NAME,
    role: 'owner',
    companyId: COMPANY_ID,
    company: COMPANY_ID,
    status: 'active',
  });

  await upsertOwnerMembership(TARGET_UID, COMPANY_ID, {
    email: TARGET_EMAIL,
    fullName: FULL_NAME,
    role: 'owner',
    status: 'active',
  });

  report.after.identity = await readProfileAndMembership(db, TARGET_UID);

  const p = report.after.identity.profile || {};
  const m = report.after.identity.membership || {};
  if (p.companyId !== COMPANY_ID || p.role !== 'owner') {
    stop(`Profile verification failed: companyId=${p.companyId} role=${p.role}`);
  }
  if (m.role !== 'owner' || (m.status && m.status !== 'active')) {
    stop(`Membership verification failed: role=${m.role} status=${m.status}`);
  }

  report.after.demoSnapshot = await snapshotDemoCompany(db);
  const demoUnchanged =
    JSON.stringify(report.before.demoSnapshot) === JSON.stringify(report.after.demoSnapshot);
  report.demoTenantUnchanged = demoUnchanged;
  if (!demoUnchanged) stop('demo-central-motors document changed unexpectedly');

  const password = process.env.JOHN_CENTRAL_MOTORS_PASSWORD || process.env.JOHN_PORTAL_PASSWORD || '';
  if (password) {
    const token = await firebaseToken(TARGET_EMAIL, password);
    const enc = encodeURIComponent(COMPANY_ID);
    const checks = {};
    const paths = [
      ['hub', `/api/portal/hub/${enc}`],
      ['company', `/api/portal/company/${enc}`],
      ['knowledge', `/api/companies/${enc}/knowledge/documents`],
      ['crm', `/api/companies/${enc}/crm/customers`],
      ['agents', `/api/companies/${enc}/ai-employees`],
      ['usage', `/api/portal/usage/${enc}`],
      ['analytics', `/api/portal/analytics/${enc}`],
      ['appointments', `/api/companies/${enc}/appointments?upcoming=true`],
      ['conversations', `/api/companies/${enc}/conversations`],
    ];
    for (const [key, path] of paths) {
      const res = await apiGet(path, token);
      checks[key] = { status: res.status, companyId: res.data?.companyId || null };
    }
    checks.hubCompanyId = checks.hub?.status === 200 ? (await apiGet(paths[0][1], token)).data?.companyId : null;
    const hubRes = await apiGet(`/api/portal/hub/${enc}`, token);
    const kbRes = await apiGet(`/api/companies/${enc}/knowledge/documents`, token);
    report.apiSmoke = {
      authenticated: true,
      checks,
      hubCompanyId: hubRes.data?.companyId,
      hubIsProvisioned: hubRes.data?.isProvisioned,
      hubIsDemo: hubRes.data?.isDemo,
      knowledgeItemCount: kbRes.data?.items?.length ?? 0,
      knowledgeBaseId: kbRes.data?.knowledgeBaseId,
      knowledgeTitlesSample: (kbRes.data?.items || []).slice(0, 3).map((i) => i.title),
    };
  } else {
    report.apiSmoke = {
      skipped: true,
      reason: 'Set JOHN_CENTRAL_MOTORS_PASSWORD for authenticated API smoke (password never logged)',
    };
  }

  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  report.error = err.message || String(err);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
