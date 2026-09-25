/**
 * One-off: copy admin Firestore profile to Auth UID path (default database).
 * Does NOT touch Firebase Auth. Does NOT delete the source document.
 *
 * Usage:
 *   node scripts/_link-admin-profile-uid.mjs
 *
 * Requires Firebase Admin credentials (.env or GOOGLE_APPLICATION_CREDENTIALS*).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  hasAdminCredentials,
  getAdminFirestore,
  getAdminInitError,
} from '../services/database/firestoreAdmin.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const AUTH_UID = 'LKeYuXvA7tRBu8qsafDo1NS795D3';
const ADMIN_EMAIL = 'admin@ziricai.com';
const SOURCE_DOC_PREFIX = process.env.ADMIN_SOURCE_DOC_PREFIX || 'd0dzJkNKR';

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

function buildTargetPayload(sourceData, authUid, sourceDocId) {
  const payload = { ...sourceData };
  payload.uid = authUid;
  payload.email = payload.email || ADMIN_EMAIL;
  if (!payload.fullName && payload.name) {
    payload.fullName = payload.name;
  }
  payload.profileLinkedFromLegacyDocId = sourceDocId;
  payload.profileLinkedAt = FieldValue.serverTimestamp();
  return payload;
}

async function findSourceDoc(db) {
  const targetRef = db.doc(`users/${AUTH_UID}`);
  const targetSnap = await targetRef.get();
  if (targetSnap.exists) {
    return { ref: targetRef, data: targetSnap.data(), alreadyExists: true };
  }

  const emailQuery = await db
    .collection('users')
    .where('email', '==', ADMIN_EMAIL)
    .limit(5)
    .get();

  if (!emailQuery.empty) {
    const match =
      emailQuery.docs.find((d) => d.id.startsWith(SOURCE_DOC_PREFIX)) ||
      emailQuery.docs.find((d) => d.id !== AUTH_UID) ||
      emailQuery.docs[0];
    return { ref: match.ref, data: match.data(), alreadyExists: false };
  }

  const prefixQuery = await db.collection('users').limit(50).get();
  const prefixMatch = prefixQuery.docs.find((d) => d.id.startsWith(SOURCE_DOC_PREFIX));
  if (prefixMatch) {
    return { ref: prefixMatch.ref, data: prefixMatch.data(), alreadyExists: false };
  }

  throw new Error(
    `No source users doc found for ${ADMIN_EMAIL} or prefix ${SOURCE_DOC_PREFIX}`
  );
}

async function main() {
  console.log('hasAdminCredentials:', hasAdminCredentials());
  const legacyDb = getAdminFirestore();
  if (!legacyDb) {
    console.error('Admin init error:', getAdminInitError() || 'missing credentials');
    process.exit(1);
  }

  const db = getFirestore(undefined, 'default');
  const source = await findSourceDoc(db);

  console.log('sourceDoc:', {
    path: source.ref.path,
    alreadyAtTargetUid: source.ref.id === AUTH_UID,
    alreadyExists: source.alreadyExists,
  });

  if (source.ref.id === AUTH_UID && source.alreadyExists) {
    console.log('targetAlreadyExists:', serializeValue(source.data));
    console.log('RESULT: no write needed — profile already at users/' + AUTH_UID);
    process.exit(0);
  }

  const targetRef = db.doc(`users/${AUTH_UID}`);
  const targetBefore = await targetRef.get();
  if (targetBefore.exists) {
    console.log('targetAlreadyExists:', serializeValue(targetBefore.data()));
    console.log('RESULT: no write needed — profile already at users/' + AUTH_UID);
    process.exit(0);
  }

  const payload = buildTargetPayload(source.data, AUTH_UID, source.ref.id);
  await targetRef.set(payload, { merge: false });

  const targetAfter = await targetRef.get();
  if (!targetAfter.exists) {
    throw new Error('Write reported success but target document still missing');
  }

  const verified = targetAfter.data();
  console.log('writeComplete:', {
    targetPath: targetRef.path,
    sourcePath: source.ref.path,
    sourceKept: true,
    fields: {
      email: verified.email,
      name: verified.name || verified.fullName || null,
      role: verified.role,
      status: verified.status,
      createdAt: serializeValue(verified.createdAt),
      uid: verified.uid,
    },
  });

  console.log('RESULT: copied profile to users/' + AUTH_UID);
}

main().catch((err) => {
  console.error('LINK_FAILED:', err.message);
  process.exit(1);
});
