#!/usr/bin/env node
/**
 * Provision a dedicated Portal owner bound to a disposable 4B acceptance tenant.
 * Does NOT modify RTB users or central-motors-rtb data.
 *
 * Requires Firebase Admin (Railway production env or local Admin creds).
 *
 * Env:
 *   PORTAL_4B_TEST_COMPANY — required tenant id (portal-4b-registry-test-*)
 *   PORTAL_4B_SMOKE_PASSWORD — required for new Auth user creation
 *   PORTAL_4B_SMOKE_EMAIL — optional; default portal-4b-accept-{companySuffix}@ziricai.com
 */
import admin from "firebase-admin";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { upsertGlobalUserProfile, upsertOwnerMembership } from "../services/auth/authService.js";
import { createCompany } from "../services/tenants/companyService.js";

const PASSWORD = process.env.PORTAL_4B_SMOKE_PASSWORD || "";
const FULL_NAME = process.env.PORTAL_4B_SMOKE_NAME || "Portal 4B Acceptance Owner";

function defaultEmailForCompany(co) {
    const suffix = String(co || "")
        .replace(/[^a-z0-9-]/gi, "")
        .slice(-24) || String(Date.now());
    return `portal-4b-accept-${suffix}@ziricai.com`.toLowerCase();
}

async function ensureAuthUser(email, password) {
    try {
        const existing = await admin.auth().getUserByEmail(email);
        if (password) {
            await admin.auth().updateUser(existing.uid, { password, displayName: FULL_NAME });
        }
        return { uid: existing.uid, created: false };
    } catch (err) {
        if (err?.code !== "auth/user-not-found") throw err;
        if (!password) {
            throw new Error("PORTAL_4B_SMOKE_PASSWORD is required to create a new Firebase Auth user");
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

export async function provisionPortal4bDisposableActor(options = {}) {
    const co = (options.companyId || process.env.PORTAL_4B_TEST_COMPANY || "").trim();
    if (!co) throw new Error("companyId is required");
    if (!hasAdminCredentials()) throw new Error("NO_ADMIN_CREDENTIALS");

    getAdminFirestore();
    if (admin.apps.length === 0) throw new Error("ADMIN_APP_UNAVAILABLE");

    const primaryCo = (process.env.PORTAL_4B_TEST_COMPANY || "").trim();
    const email = (
        options.email ||
        (process.env.PORTAL_4B_SMOKE_EMAIL && co === primaryCo
            ? process.env.PORTAL_4B_SMOKE_EMAIL
            : defaultEmailForCompany(co))
    )
        .trim()
        .toLowerCase();
    const password = options.password || PASSWORD;

    await createCompany(co, {
        name: options.companyName || `Portal 4B Registry Test ${co}`,
        industry: "Test",
        status: "active",
    });

    const { uid, created: authCreated } = await ensureAuthUser(email, password);

    await upsertGlobalUserProfile(uid, {
        email,
        fullName: FULL_NAME,
        name: FULL_NAME,
        role: "owner",
        companyId: co,
        company: co,
        status: "active",
    });

    await upsertOwnerMembership(uid, co, {
        email,
        fullName: FULL_NAME,
        role: "owner",
        status: "active",
    });

    const db = getAdminFirestore();
    const profileSnap = await db.collection("users").doc(uid).get();
    const memberSnap = await db.collection("companies").doc(co).collection("users").doc(uid).get();

    return {
        companyId: co,
        email,
        uid,
        authUserCreated: authCreated,
        profileCompanyId: profileSnap.data()?.companyId || profileSnap.data()?.company || null,
        membershipExists: memberSnap.exists,
        membershipRole: memberSnap.data()?.role || null,
    };
}

if (process.argv[1]?.includes("provision-portal-4b-disposable-acceptance-actor")) {
    provisionPortal4bDisposableActor()
        .then((out) => {
            console.log(JSON.stringify({ ok: true, ...out, note: "Password not echoed." }, null, 2));
        })
        .catch((err) => {
            console.log(JSON.stringify({ ok: false, error: err.message || String(err) }));
            process.exit(1);
        });
}
