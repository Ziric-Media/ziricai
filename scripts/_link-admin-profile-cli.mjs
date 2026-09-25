/**
 * Copy admin profile to Auth UID using Firebase CLI OAuth session.
 * Does NOT touch Firebase Auth. Does NOT delete source document.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const AUTH_UID = 'LKeYuXvA7tRBu8qsafDo1NS795D3';
const ADMIN_EMAIL = 'admin@ziricai.com';
const PROJECT_ID = 'ziricai';
const DATABASE_ID = 'default';
const SOURCE_DOC_PREFIX = process.env.ADMIN_SOURCE_DOC_PREFIX || 'd0dzJkNKR';

function restValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value.toDate === 'function') {
    return { timestampValue: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(restValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = restValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function restFieldsToObject(fields = {}) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    out[key] = parseRestValue(val);
  }
  return out;
}

function parseRestValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(parseRestValue);
  }
  if ('mapValue' in value) {
    return restFieldsToObject(value.mapValue.fields || {});
  }
  return null;
}

function objectToRestFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    fields[key] = restValue(val);
  }
  return fields;
}

async function getFirebaseCliAccessToken() {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const auth = require('firebase-tools/lib/auth');
  const scopes = require('firebase-tools/lib/scopes');

  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI login required. Run: firebase login');
  }

  const tokens = await auth.getAccessToken(account.tokens.refresh_token, [
    scopes.CLOUD_PLATFORM,
  ]);
  if (!tokens?.access_token) {
    throw new Error('Unable to obtain Firebase CLI access token');
  }
  return tokens.access_token;
}

async function firestoreFetch(token, method, docPath, body) {
  const base =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
  const url = docPath ? `${base}/${docPath}` : base;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `${method} ${url} failed (${res.status})`);
  }
  return json;
}

async function listUsers(token) {
  const json = await firestoreFetch(token, 'GET', 'users?pageSize=100');
  return (json.documents || []).map((doc) => {
    const id = doc.name.split('/').pop();
    const data = restFieldsToObject(doc.fields || {});
    return { id, data, raw: doc };
  });
}

async function findSourceDoc(token) {
  const targetPath = `users/${AUTH_UID}`;
  try {
    const existing = await firestoreFetch(token, 'GET', targetPath);
    return {
      sourceId: AUTH_UID,
      targetExists: true,
      data: restFieldsToObject(existing.fields || {}),
    };
  } catch (err) {
    if (!/not found/i.test(err.message)) throw err;
  }

  const users = await listUsers(token);
  const emailMatch = users.find(
    (u) => String(u.data.email || '').toLowerCase() === ADMIN_EMAIL && u.id !== AUTH_UID
  );
  if (emailMatch) {
    return { sourceId: emailMatch.id, targetExists: false, data: emailMatch.data };
  }

  const prefixMatch = users.find((u) => u.id.startsWith(SOURCE_DOC_PREFIX));
  if (prefixMatch) {
    return { sourceId: prefixMatch.id, targetExists: false, data: prefixMatch.data };
  }

  throw new Error(`No source users doc found for ${ADMIN_EMAIL}`);
}

async function main() {
  const token = await getFirebaseCliAccessToken();
  const source = await findSourceDoc(token);

  console.log('sourceDoc:', {
    sourceId: source.sourceId,
    targetPath: `users/${AUTH_UID}`,
    targetExists: source.targetExists,
    email: source.data.email,
    name: source.data.name || source.data.fullName,
    role: source.data.role,
    status: source.data.status,
    createdAt: source.data.createdAt || null,
  });

  if (source.targetExists) {
    console.log('RESULT: no write needed — profile already at users/' + AUTH_UID);
    return;
  }

  const payload = {
    ...source.data,
    uid: AUTH_UID,
    email: source.data.email || ADMIN_EMAIL,
    fullName: source.data.fullName || source.data.name || 'Spencer Gore',
    profileLinkedFromLegacyDocId: source.sourceId,
    profileLinkedAt: new Date().toISOString(),
  };

  await firestoreFetch(
    token,
    'POST',
    `users?documentId=${encodeURIComponent(AUTH_UID)}`,
    { fields: objectToRestFields(payload) }
  );

  const verified = await firestoreFetch(token, 'GET', `users/${AUTH_UID}`);
  const verifiedData = restFieldsToObject(verified.fields || {});

  console.log('writeComplete:', {
    targetPath: `users/${AUTH_UID}`,
    sourceKept: true,
    sourcePath: `users/${source.sourceId}`,
    fields: {
      email: verifiedData.email,
      name: verifiedData.name || verifiedData.fullName,
      role: verifiedData.role,
      status: verifiedData.status,
      createdAt: verifiedData.createdAt || null,
      uid: verifiedData.uid,
      profileLinkedFromLegacyDocId: verifiedData.profileLinkedFromLegacyDocId,
    },
  });
  console.log('RESULT: copied profile to users/' + AUTH_UID);
}

main().catch((err) => {
  console.error('LINK_FAILED:', err.message);
  process.exit(1);
});
