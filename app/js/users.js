/**

 * Firestore user profile module for Ziric Media AI.

 *

 * Manages user profile documents in the `users` collection.

 * Each document is keyed by Firebase Auth uid and stores display

 * and account metadata separate from authentication state.

 */

import {

  doc,

  setDoc,

  getDoc,
  getDocFromServer,

  updateDoc,

  serverTimestamp,

} from 'firebase/firestore';

import { db, auth, ensureFirestoreReady } from './firebase.js';



/** Fields that may be partially updated via updateUserProfile. */

const FIRESTORE_WRITE_TIMEOUT_MS = 20000;
const AUTH_READY_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function formatFirestoreError(error, uid) {
  const code = error?.code ?? '';
  const message = error?.message ?? 'Firestore operation failed.';

  if (message.startsWith('Timed out creating Firestore user profile')) {
    return (
      `${message} If the default Firestore database was just created, wait a minute and retry. ` +
      'Otherwise create the (default) database in Firebase Console and deploy firestore.rules.'
    );
  }

  if (code === 'permission-denied') {
    return (
      `Firestore permission denied for users/${uid}. ` +
      'Deploy firestore.rules in Firebase Console (Firestore â†’ Rules) so authenticated users can read their own profile. ' +
      `(${message})`
    );
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('database') &&
    (lower.includes('not found') || lower.includes('does not exist'))
  ) {
    return (
      'Firestore is not enabled for this Firebase project. In Firebase Console open ' +
      'Build -> Firestore Database -> Create database (use the default database), then deploy ' +
      `firestore.rules from this repo. (${message})`
    );
  }

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    const offlineHint = message.toLowerCase().includes('offline')
      ? ' This often means firestore.rules are not deployed yet, or the page was opened via file:// instead of a local server (npm run dev).'
      : '';
    return (
      `${code}: ${message}${offlineHint} Check network connectivity, deploy firestore.rules, and use npm run dev.`
    );
  }

  return code ? `${code}: ${message}` : message;
}



/**
 * Uses the public Firestore REST API to detect a missing (default) database before setDoc,
 * which otherwise hangs until the client write timeout.
 */
async function probeDefaultFirestoreDatabase() {
  const projectId = auth.app?.options?.projectId;
  const apiKey = auth.app?.options?.apiKey;
  if (!projectId || !apiKey) {
    return { ok: true };
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/__ziric_firestore_probe__?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url);
    if (res.status !== 404) {
      return { ok: true };
    }

    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? '';
    if (
      /database\s*\(default\)\s*does not exist/i.test(msg) ||
      msg.toLowerCase().includes('does not exist for project')
    ) {
      return {
        error:
          'Firestore default database does not exist for project "' +
          projectId +
          '". In Firebase Console open Build -> Firestore Database -> Create database, ' +
          'select Production or Test mode, choose a region, and finish (this creates the (default) database). ' +
          'Then from this project folder run: firebase login && firebase deploy --only firestore:rules. ' +
          'If you already created Firestore with a custom database ID, the web app cannot use it until you also create (default) or change js/firebase.js to pass that database ID to getFirestore().',
      };
    }

    return { ok: true };
  } catch (probeError) {
    console.warn('Firestore default-database probe failed; continuing with setDoc:', probeError);
    return { ok: true };
  }
}

async function ensureAuthForProfileWrite(uid) {
  await withTimeout(
    auth.authStateReady(),
    AUTH_READY_TIMEOUT_MS,
    'Timed out waiting for Firebase Auth session after registration.'
  );
  const user = auth.currentUser;
  if (!user) {
    return {
      error:
        'Not signed in after registration. Firestore profile writes require an authenticated session.',
    };
  }
  if (user.uid !== uid) {
    return {
      error: `Signed-in user (${user.uid}) does not match profile uid (${uid}).`,
    };
  }
  return { ok: true };
}

const UPDATABLE_PROFILE_FIELDS = ['fullName', 'name', 'email', 'role', 'company', 'companyId', 'status', 'mfaEnabled'];



/**

 * @typedef {Object} UserProfileInput

 * @property {string} fullName

 * @property {string} email

 * @property {string} role

 * @property {string} company

 * @property {string} status

 */



/**

 * @typedef {Object} UserProfile

 * @property {string} uid

 * @property {string} fullName

 * @property {string} email

 * @property {string} role

 * @property {string} company

 * @property {string} status

 * @property {import('firebase/firestore').Timestamp | null} createdAt

 * @property {import('firebase/firestore').Timestamp | null} lastLogin

 */



/**

 * Builds the Firestore payload from caller-supplied profile fields.

 * Timestamps are set server-side so clients cannot backdate records.

 *

 * @param {string} uid

 * @param {UserProfileInput} profileData

 * @returns {Record<string, unknown>}

 */

function buildProfilePayload(uid, profileData) {
  const companyId = profileData.companyId || null;
  return {
    uid,
    fullName: profileData.fullName,
    email: profileData.email,
    role: profileData.role,
    company: profileData.company || companyId || '',
    companyId,
    status: profileData.status,
    mfaEnabled: Boolean(profileData.mfaEnabled),
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  };
}



/**

 * Normalizes raw Firestore data into a consistent UserProfile shape.

 *

 * @param {string} uid

 * @param {Record<string, unknown>} data

 * @returns {UserProfile}

 */

function normalizeProfile(uid, data) {
  const companyId = data.companyId || data.company || '';
  return {
    uid: data.uid ?? uid,
    fullName: data.fullName ?? data.name ?? '',
    email: data.email ?? '',
    role: data.role ?? '',
    company: data.company ?? companyId,
    companyId,
    status: data.status ?? '',
    mfaEnabled: Boolean(data.mfaEnabled),
    createdAt: data.createdAt ?? null,
    lastLogin: data.lastLogin ?? null,
  };
}



/**

 * Creates a user profile document at users/{uid}.

 *

 * @param {string} uid Firebase Auth user id (used as document id)

 * @param {UserProfileInput} profileData Profile fields supplied by the caller

 * @returns {Promise<{ success: true, profile: UserProfile } | { error: string }>}

 */

export async function createUserProfile(uid, profileData) {
  try {
    const authCheck = await ensureAuthForProfileWrite(uid);
    if (authCheck.error) {
      return { error: authCheck.error };
    }

    const dbCheck = await probeDefaultFirestoreDatabase();
    if (dbCheck.error) {
      return { error: dbCheck.error };
    }

    const profileRef = doc(db, 'users', uid);
    const payload = buildProfilePayload(uid, profileData);

    await withTimeout(
      setDoc(profileRef, payload),
      FIRESTORE_WRITE_TIMEOUT_MS,
      'Timed out creating Firestore user profile. Enable the default Firestore database in ' +
        'Firebase Console and deploy firestore.rules, then try again.'
    );



    // serverTimestamp() resolves on the server; return caller fields for immediate use

    return {

      success: true,

      profile: {

        uid,

        fullName: profileData.fullName,

        email: profileData.email,

        role: profileData.role,

        company: profileData.company || profileData.companyId || '',

        companyId: profileData.companyId || null,

        status: profileData.status,

        mfaEnabled: Boolean(profileData.mfaEnabled),

        createdAt: null,

        lastLogin: null,

      },

    };

  } catch (error) {

    console.error('createUserProfile failed:', error);
    return { error: formatFirestoreError(error, uid) };

  }

}



/**

 * Fetches a user profile from users/{uid}.

 *

 * @param {string} uid Firebase Auth user id

 * @returns {Promise<{ profile: UserProfile } | { error: string }>}

 */


function isRetryableFirestoreReadError(error) {
  const code = error?.code ?? '';
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    message.includes('offline') ||
    message.includes('failed to get document')
  );
}

function parseRestFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  return null;
}

function restFieldsToObject(fields) {
  const out = {};
  for (const [key, val] of Object.entries(fields || {})) {
    out[key] = parseRestFirestoreValue(val);
  }
  return out;
}

async function fetchUserProfileViaRest(uid) {
  const projectId = auth.app?.options?.projectId;
  const user = auth.currentUser;
  if (!projectId || !user) {
    return { error: 'Not authenticated for Firestore REST read.' };
  }

  const token = await user.getIdToken(true);
  const url =
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(projectId) +
    '/databases/(default)/documents/users/' +
    encodeURIComponent(uid);

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
  });

  if (res.status === 404) {
    return { notFound: true };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || ('Firestore REST read failed (' + res.status + ').');
    if (res.status === 403 || /permission/i.test(message)) {
      return { error: 'Firestore permission denied for users/' + uid + '. Deploy firestore.rules. (' + message + ')' };
    }
    return { error: message };
  }

  const docJson = await res.json();
  return { data: restFieldsToObject(docJson.fields) };
}

async function readUserProfileSnapshot(profileRef) {
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await ensureFirestoreReady();
      return await getDocFromServer(profileRef);
    } catch (error) {
      lastError = error;
      if (!isRetryableFirestoreReadError(error) || attempt === 3) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  try {
    return await getDoc(profileRef);
  } catch (error) {
    throw lastError || error;
  }
}

export async function getUserProfile(uid) {
  try {
    await ensureFirestoreReady();

    const profileRef = doc(db, 'users', uid);
    let snapshot;

    try {
      snapshot = await readUserProfileSnapshot(profileRef);
    } catch (sdkError) {
      if (!isRetryableFirestoreReadError(sdkError)) {
        throw sdkError;
      }
      const restResult = await fetchUserProfileViaRest(uid);
      if (restResult.error) {
        return { error: restResult.error };
      }
      if (restResult.notFound) {
        return { error: 'User profile not found.' };
      }
      return { profile: normalizeProfile(uid, restResult.data) };
    }

    if (!snapshot.exists()) {
      return { error: 'User profile not found.' };
    }

    return { profile: normalizeProfile(uid, snapshot.data()) };
  } catch (error) {
    console.error('getUserProfile failed:', error);
    return { error: formatFirestoreError(error, uid) };
  }
}



/**

 * Partially updates allowed profile fields on users/{uid}.

 * Does not modify uid or createdAt.

 *

 * @param {string} uid Firebase Auth user id

 * @param {Partial<UserProfileInput>} updates Fields to merge into the existing profile

 * @returns {Promise<{ success: true, profile: UserProfile } | { error: string }>}

 */

export async function updateUserProfile(uid, updates) {

  try {

    const profileRef = doc(db, 'users', uid);

    const snapshot = await getDoc(profileRef);



    if (!snapshot.exists()) {

      return { error: 'User profile not found.' };

    }



    /** @type {Record<string, unknown>} */

    const patch = {};

    for (const field of UPDATABLE_PROFILE_FIELDS) {

      if (Object.prototype.hasOwnProperty.call(updates, field)) {

        patch[field] = updates[field];

      }

    }



    if (Object.keys(patch).length === 0) {

      return { error: 'No valid profile fields to update.' };

    }



    await updateDoc(profileRef, patch);



    const existing = snapshot.data();

    return {

      success: true,

      profile: normalizeProfile(uid, { ...existing, ...patch }),

    };

  } catch (error) {

    console.error('updateUserProfile failed:', error);
    return { error: formatFirestoreError(error, uid) };

  }

}



/**

 * Updates the lastLogin field for users/{uid} to the current server time.

 *

 * @param {string} uid Firebase Auth user id

 * @returns {Promise<{ success: true } | { error: string }>}

 */

export async function updateLastLogin(uid) {

  try {

    const profileRef = doc(db, 'users', uid);

    const snapshot = await getDoc(profileRef);



    if (!snapshot.exists()) {

      return { error: 'User profile not found.' };

    }



    await updateDoc(profileRef, { lastLogin: serverTimestamp() });

    return { success: true };

  } catch (error) {

    console.error('updateLastLogin failed:', error);
    return { error: formatFirestoreError(error, uid) };

  }

}

/**
 * Creates tenant membership at companies/{companyId}/users/{uid}.
 * @param {string} uid
 * @param {string} companyId
 * @param {object} data
 */
export async function createTenantMembership(uid, companyId, data = {}) {
  try {
    const authCheck = await ensureAuthForProfileWrite(uid);
    if (authCheck.error) {
      return { error: authCheck.error };
    }

    const memberRef = doc(db, 'companies', companyId, 'users', uid);
    const payload = {
      uid,
      companyId,
      email: data.email || '',
      fullName: data.fullName || data.name || '',
      role: data.role || 'owner',
      status: data.status || 'active',
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    };

    await withTimeout(
      setDoc(memberRef, payload, { merge: true }),
      FIRESTORE_WRITE_TIMEOUT_MS,
      'Timed out creating tenant membership doc.'
    );

    return {
      success: true,
      membership: {
        ...payload,
        createdAt: null,
        lastLogin: null,
      },
    };
  } catch (error) {
    console.error('createTenantMembership failed:', error);
    return { error: formatFirestoreError(error, uid) };
  }
}

