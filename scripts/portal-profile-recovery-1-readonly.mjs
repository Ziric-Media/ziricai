#!/usr/bin/env node
/**
 * PORTAL-PROFILE-RECOVERY-1 — minimal read-only Firestore probe (sequential, stop on quota).
 */
import { getAdminFirestore, hasAdminCredentials } from "../services/database/firestoreAdmin.js";

const UID = "toUXzw4ZhPPqVI6KXVTSGvi3h8e2";
const COMPANY = "central-motors-rtb";

const report = {
  gate: "PORTAL-PROFILE-RECOVERY-1",
  step1: {},
  stoppedEarly: false,
  stopReason: null,
};

function quotaStop(err, key) {
  report.step1[key] = { ok: false, error: err.message, code: err.code ?? null };
  if (String(err.message || "").includes("RESOURCE_EXHAUSTED") || err.code === 8) {
    report.stoppedEarly = true;
    report.stopReason = "RESOURCE_EXHAUSTED";
  }
}

if (!hasAdminCredentials()) {
  report.error = "NO_ADMIN_CREDENTIALS";
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const db = getAdminFirestore();

try {
  const userSnap = await db.collection("users").doc(UID).get();
  report.step1.userProfile = {
    ok: true,
    exists: userSnap.exists,
    companyId: userSnap.exists ? userSnap.data()?.companyId || userSnap.data()?.company || null : null,
    role: userSnap.exists ? userSnap.data()?.role || null : null,
    status: userSnap.exists ? userSnap.data()?.status || null : null,
    email: userSnap.exists ? userSnap.data()?.email || null : null,
  };
} catch (e) {
  quotaStop(e, "userProfile");
}

if (!report.stoppedEarly) {
  try {
    const memSnap = await db.collection("companies").doc(COMPANY).collection("users").doc(UID).get();
    report.step1.membership = {
      ok: true,
      exists: memSnap.exists,
      companyId: memSnap.exists ? memSnap.data()?.companyId || COMPANY : null,
      role: memSnap.exists ? memSnap.data()?.role || null : null,
      status: memSnap.exists ? memSnap.data()?.status || null : null,
    };
  } catch (e) {
    quotaStop(e, "membership");
  }
}

if (!report.stoppedEarly) {
  try {
    const coSnap = await db.collection("companies").doc(COMPANY).get();
    report.step1.company = {
      ok: true,
      exists: coSnap.exists,
      name: coSnap.exists ? coSnap.data()?.name || null : null,
      status: coSnap.exists ? coSnap.data()?.status || null : null,
    };
  } catch (e) {
    quotaStop(e, "company");
  }
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.stoppedEarly ? 2 : 0);
