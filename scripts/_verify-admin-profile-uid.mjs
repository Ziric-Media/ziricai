import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const scopes = require('firebase-tools/lib/scopes');

const AUTH_UID = 'LKeYuXvA7tRBu8qsafDo1NS795D3';
const LEGACY_ID = 'dOdzJkNKRYXiYPqxZ0V0yoYZZKA3';

function parseFields(fields = {}) {
  const get = (k) => {
    const v = fields[k];
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('booleanValue' in v) return v.booleanValue;
    return null;
  };
  return {
    email: get('email'),
    name: get('name'),
    fullName: get('fullName'),
    role: get('role'),
    status: get('status'),
    createdAt: get('createdAt'),
    uid: get('uid'),
    profileLinkedFromLegacyDocId: get('profileLinkedFromLegacyDocId'),
  };
}

const account = auth.getGlobalDefaultAccount();
const tokens = await auth.getAccessToken(account.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);
const headers = { Authorization: 'Bearer ' + tokens.access_token };

const targetRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/ziricai/databases/default/documents/users/${AUTH_UID}`,
  { headers }
);
const targetJson = await targetRes.json();
const target = parseFields(targetJson.fields);

const legacyRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/ziricai/databases/default/documents/users/${LEGACY_ID}`,
  { headers }
);

console.log(JSON.stringify({
  getUserProfileEquivalent: {
    uid: AUTH_UID,
    exists: targetRes.ok,
    profile: targetRes.ok ? target : null,
    wouldPassSuperAdminGate: target.role === 'superadmin' && String(target.status).toLowerCase() === 'active',
  },
  legacyDoc: {
    path: `users/${LEGACY_ID}`,
    stillExists: legacyRes.ok,
  },
}, null, 2));
