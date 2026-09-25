#!/usr/bin/env node
/**
 * Provision a dedicated Portal owner for central-motors-rtb (smoke / pilot access).
 *
 * Does NOT modify john@centralmotors.co.za or demo-central-motors data.
 * Requires Firebase Admin credentials (Railway production env).
 *
 * Usage (Railway):
 *   PORTAL_RTB_SMOKE_EMAIL=portal-rtb-smoke@ziricai.com \
 *   PORTAL_RTB_SMOKE_PASSWORD='...' \
 *   node scripts/provision-rtb-portal-smoke-user.mjs
 *
 * Idempotent: re-run updates profile + membership for the same email.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from '../services/inventory/adapters/centralMotorsRtbAdapter.js';
import { hasAdminCredentials, getAdminFirestore } from '../services/database/firestoreAdmin.js';
import { upsertGlobalUserProfile, upsertOwnerMembership } from '../services/auth/authService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const COMPANY_ID = CENTRAL_MOTORS_RTB_COMPANY_ID;
const EMAIL = (process.env.PORTAL_RTB_SMOKE_EMAIL || 'portal-rtb-smoke@ziricai.com').trim().toLowerCase();
const PASSWORD = process.env.PORTAL_RTB_SMOKE_PASSWORD || '';
const FULL_NAME = process.env.PORTAL_RTB_SMOKE_NAME || 'RTB Portal Smoke Owner';

async function ensureAuthUser(email, password) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    if (password) {
      await admin.auth().updateUser(existing.uid, { password, displayName: FULL_NAME });
    }
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    if (!password) {
      throw new Error('PORTAL_RTB_SMOKE_PASSWORD is required to create a new Firebase Auth user');
    }
    const created = await admin.auth().createUser({
      email,
      password,
      displayName: FULL_NAME,
      emailVerified: true,
    });
    return { uid: created.uid, created: true };
  }
}

async function main() {
  if (!hasAdminCredentials()) {
    console.log(JSON.stringify({ ok: false, error: 'NO_ADMIN_CREDENTIALS' }));
    process.exit(1);
  }

  getAdminFirestore();
  if (admin.apps.length === 0) {
    console.log(JSON.stringify({ ok: false, error: 'ADMIN_APP_UNAVAILABLE' }));
    process.exit(1);
  }

  const db = getAdminFirestore();
  const companySnap = await db.collection('companies').doc(COMPANY_ID).get();
  if (!companySnap.exists) {
    console.log(JSON.stringify({ ok: false, error: 'RTB_COMPANY_MISSING', companyId: COMPANY_ID }));
    process.exit(1);
  }

  const { uid, created: authCreated } = await ensureAuthUser(EMAIL, PASSWORD);

  await upsertGlobalUserProfile(uid, {
    email: EMAIL,
    fullName: FULL_NAME,
    name: FULL_NAME,
    role: 'owner',
    companyId: COMPANY_ID,
    company: COMPANY_ID,
    status: 'active',
  });

  await upsertOwnerMembership(uid, COMPANY_ID, {
    email: EMAIL,
    fullName: FULL_NAME,
    role: 'owner',
    status: 'active',
  });

  const profileSnap = await db.collection('users').doc(uid).get();
  const memberSnap = await db.collection('companies').doc(COMPANY_ID).collection('users').doc(uid).get();

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId: COMPANY_ID,
        email: EMAIL,
        uid,
        authUserCreated: authCreated,
        profileExists: profileSnap.exists,
        profileCompanyId: profileSnap.data()?.companyId || null,
        membershipExists: memberSnap.exists,
        membershipRole: memberSnap.data()?.role || null,
        isDemo: false,
        note: 'Password was set via PORTAL_RTB_SMOKE_PASSWORD; not echoed here.',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message || String(err) }));
  process.exit(1);
});
