#!/usr/bin/env node
/**
 * PORTAL-PROFILE-REGRESSION-1 — read-only production Firestore + env snapshot.
 * No writes. No memory fallback as production evidence.
 */
import admin from "firebase-admin";
import { getAdminFirestore, hasAdminCredentials } from "../services/database/firestoreAdmin.js";
import { getUserProfile, getTenantMembership } from "../services/auth/authService.js";

const JOHN_UID = "toUXzw4ZhPPqVI6KXVTSGvi3h8e2";
const JOHN_EMAIL = "john@centralmotors.co.za";
const RTB = "central-motors-rtb";
const CLIENT2 = "client2-tp2c-accept-20260917";
const CLIENT2_UID = "9pu1YnoWZQdR516jx1O9E2oAygl1";

const report = {
  gate: "PORTAL-PROFILE-REGRESSION-1",
  env: {
    tenantScopeEnforcement: process.env.TENANT_SCOPE_ENFORCEMENT || "(unset)",
    storageBackend: process.env.STORAGE_BACKEND || "(unset)",
    centralMotorsPilot: process.env.CENTRAL_MOTORS_PILOT || "(unset)",
    defaultCompanyId: process.env.DEFAULT_COMPANY_ID || "(unset)",
  },
  firestoreAdmin: hasAdminCredentials(),
  subjects: {},
};

async function adminReadUser(uid) {
  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return { exists: false };
  const d = snap.data();
  return {
    exists: true,
    email: d.email || null,
    companyId: d.companyId || d.company || null,
    role: d.role || null,
    status: d.status || null,
  };
}

async function adminReadMembership(companyId, uid) {
  const db = getAdminFirestore();
  const snap = await db.collection("companies").doc(companyId).collection("users").doc(uid).get();
  if (!snap.exists) return { exists: false };
  const d = snap.data();
  return {
    exists: true,
    role: d.role || null,
    status: d.status || null,
    email: d.email || null,
  };
}

async function adminReadCompany(companyId) {
  const db = getAdminFirestore();
  const snap = await db.collection("companies").doc(companyId).get();
  if (!snap.exists) return { exists: false };
  const d = snap.data();
  return { exists: true, name: d.name || null, status: d.status || null };
}

async function authServiceReads(uid, companyId) {
  const profile = await getUserProfile(uid);
  const membership = await getTenantMembership(uid, companyId);
  return {
    profile: profile
      ? { companyId: profile.companyId, role: profile.role, email: profile.email, status: profile.status }
      : null,
    membership: membership
      ? { role: membership.role, status: membership.status, email: membership.email }
      : null,
  };
}

async function probeSubject(key, uid, email, companyId) {
  const row = { uid, email, companyId, admin: {}, authService: {}, errors: [] };
  try {
    row.admin.profile = await adminReadUser(uid);
  } catch (e) {
    row.errors.push({ layer: "adminProfile", message: e.message, code: e.code });
  }
  try {
    row.admin.membership = await adminReadMembership(companyId, uid);
  } catch (e) {
    row.errors.push({ layer: "adminMembership", message: e.message, code: e.code });
  }
  try {
    row.admin.company = await adminReadCompany(companyId);
  } catch (e) {
    row.errors.push({ layer: "adminCompany", message: e.message, code: e.code });
  }
  try {
    row.authService = await authServiceReads(uid, companyId);
  } catch (e) {
    row.errors.push({ layer: "authService", message: e.message, code: e.code });
  }
  report.subjects[key] = row;
}

try {
  getAdminFirestore();
  if (!admin.apps.length) {
    report.error = "FIREBASE_ADMIN_UNAVAILABLE";
  } else {
    await probeSubject("john_rtb", JOHN_UID, JOHN_EMAIL, RTB);
    await probeSubject("client2_acceptance", CLIENT2_UID, "tp2c-acceptance-2026-09-17@ziricai.com", CLIENT2);
  }
} catch (e) {
  report.error = e.message;
  report.errorCode = e.code;
}

console.log(JSON.stringify(report, null, 2));
