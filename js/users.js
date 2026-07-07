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
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';

/** Fields that may be partially updated via updateUserProfile. */
const UPDATABLE_PROFILE_FIELDS = ['fullName', 'email', 'role', 'company', 'status'];

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
  return {
    uid,
    fullName: profileData.fullName,
    email: profileData.email,
    role: profileData.role,
    company: profileData.company,
    status: profileData.status,
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
  return {
    uid: data.uid ?? uid,
    fullName: data.fullName ?? '',
    email: data.email ?? '',
    role: data.role ?? '',
    company: data.company ?? '',
    status: data.status ?? '',
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
    const profileRef = doc(db, 'users', uid);
    const payload = buildProfilePayload(uid, profileData);

    await setDoc(profileRef, payload);

    // serverTimestamp() resolves on the server; return caller fields for immediate use
    return {
      success: true,
      profile: {
        uid,
        fullName: profileData.fullName,
        email: profileData.email,
        role: profileData.role,
        company: profileData.company,
        status: profileData.status,
        createdAt: null,
        lastLogin: null,
      },
    };
  } catch (error) {
    return { error: error?.message || 'Failed to create user profile.' };
  }
}

/**
 * Fetches a user profile from users/{uid}.
 *
 * @param {string} uid Firebase Auth user id
 * @returns {Promise<{ profile: UserProfile } | { error: string }>}
 */
export async function getUserProfile(uid) {
  try {
    const profileRef = doc(db, 'users', uid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) {
      return { error: 'User profile not found.' };
    }

    return { profile: normalizeProfile(uid, snapshot.data()) };
  } catch (error) {
    return { error: error?.message || 'Failed to fetch user profile.' };
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
    return { error: error?.message || 'Failed to update user profile.' };
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
    return { error: error?.message || 'Failed to update last login.' };
  }
}
