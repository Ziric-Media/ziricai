#!/usr/bin/env node
/**
 * Read-only audit: Portal users/memberships for central-motors-rtb.
 * Does not mutate any data. Safe for production Firestore (Railway env).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const RTB = 'central-motors-rtb';
const DEMO = 'demo-central-motors';

const { hasAdminCredentials, getAdminFirestore } = await import('../services/database/firestoreAdmin.js');

if (!hasAdminCredentials()) {
  console.log(JSON.stringify({ ok: false, error: 'NO_ADMIN_CREDENTIALS' }));
  process.exit(0);
}

const db = getAdminFirestore();
if (!db) {
  console.log(JSON.stringify({ ok: false, error: 'ADMIN_FIRESTORE_UNAVAILABLE' }));
  process.exit(0);
}

const companySnap = await db.collection('companies').doc(RTB).get();
const demoCompanySnap = await db.collection('companies').doc(DEMO).get();

const profileSnap = await db.collection('users').where('companyId', '==', RTB).limit(25).get();
const profiles = profileSnap.docs.map((d) => {
  const data = d.data();
  return {
    uid: d.id,
    email: data.email || null,
    role: data.role || null,
    companyId: data.companyId || null,
    isDemo: data.isDemo ?? null,
    status: data.status || null,
  };
});

const memberSnap = await db.collection('companies').doc(RTB).collection('users').limit(25).get();
const members = memberSnap.docs.map((d) => {
  const data = d.data();
  return {
    uid: d.id,
    email: data.email || null,
    role: data.role || null,
    status: data.status || null,
  };
});

const johnSnap = await db.collection('users').where('email', '==', 'john@centralmotors.co.za').limit(5).get();
const johnProfiles = johnSnap.docs.map((d) => {
  const data = d.data();
  return { uid: d.id, email: data.email, companyId: data.companyId, isDemo: data.isDemo ?? null, role: data.role };
});

console.log(
  JSON.stringify(
    {
      ok: true,
      rtdCompanyExists: companySnap.exists,
      demoCompanyExists: demoCompanySnap.exists,
      rtdProfileCount: profiles.length,
      rtdProfiles: profiles,
      rtdMemberCount: members.length,
      rtdMembers: members,
      johnProfileDocs: johnProfiles,
    },
    null,
    2,
  ),
);
