#!/usr/bin/env node
/**
 * Pre-flight for local staging Operations smoke — checks project alignment without printing secrets.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import {
    normalizeFirebaseEnvString,
    resolveWebFirebaseFromProcessEnv,
    getFirebaseDatabaseId,
} from "../js/firebase-config.js";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

bootstrapEnv();

const EXPECT_PROJECT = process.env.OPS_EXPECT_FIREBASE_PROJECT || "ziricai-staging";
const checks = [];

function pass(name, detail = "") {
    checks.push({ name, ok: true, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
    checks.push({ name, ok: false, detail });
    console.error(`✗ ${name} — ${detail}`);
}

function adminProjectIdFromEnv() {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (raw) {
        try {
            const j = JSON.parse(raw);
            if (j.project_id) return j.project_id;
        } catch {
            /* fall through */
        }
    }
    return normalizeFirebaseEnvString(process.env.FIREBASE_PROJECT_ID) || null;
}

console.log("verify-local-firebase-alignment\n");

const rawApiKey = process.env.FIREBASE_API_KEY;
if (!rawApiKey) {
    fail("FIREBASE_API_KEY", "unset — add staging web API key to .env.local-staging");
} else if (String(rawApiKey).trim().startsWith("Promise")) {
    fail(
        "FIREBASE_API_KEY",
        "value looks like an unresolved Promise string — replace with plain key from Firebase Console"
    );
} else {
    pass("FIREBASE_API_KEY", "set (not logged)");
}

const web = resolveWebFirebaseFromProcessEnv();
if (web.projectId !== EXPECT_PROJECT) {
    fail("Web projectId", `expected ${EXPECT_PROJECT}, got ${web.projectId || "(missing)"}`);
} else {
    pass("Web projectId", EXPECT_PROJECT);
}

if (!web.apiKey || String(web.apiKey).startsWith("Promise") || web.apiKey === "your_firebase_web_api_key") {
    fail("Resolved web apiKey", "invalid — set plain staging FIREBASE_API_KEY in .env.local-staging");
} else {
    pass("Resolved web apiKey", "usable for sign-in / verify");
}

if (!hasAdminCredentials()) {
    fail("Admin credentials", "set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_*");
} else {
    pass("Admin credentials", "present");
    const adminProject = adminProjectIdFromEnv();
    if (adminProject && adminProject !== EXPECT_PROJECT) {
        fail("Admin project", `expected ${EXPECT_PROJECT}, env suggests ${adminProject}`);
    } else if (adminProject) {
        pass("Admin project", adminProject);
    } else {
        pass("Admin project", "(could not parse — confirm service account is staging)");
    }
}

if (process.env.STORAGE_BACKEND !== "firestore") {
    fail("STORAGE_BACKEND", `expected firestore for live smoke, got ${process.env.STORAGE_BACKEND || "(unset)"}`);
} else {
    pass("STORAGE_BACKEND", "firestore");
}

if (process.env.TENANT_SCOPE_ENFORCEMENT !== "strict") {
    fail(
        "TENANT_SCOPE_ENFORCEMENT",
        `expected strict for live smoke, got ${process.env.TENANT_SCOPE_ENFORCEMENT || "(unset)"}`
    );
} else {
    pass("TENANT_SCOPE_ENFORCEMENT", "strict");
}

const stagingCredPath = join(ROOT, "test-results", "ops-centre-staging-credentials.json");
const credPath =
    process.env.OPS_SMOKE_CREDENTIALS ||
    (existsSync(stagingCredPath) ? stagingCredPath : join(ROOT, "test-results", "client-0-2-embed-signup-e2e-credentials.json"));
if (!existsSync(credPath)) {
    fail("Smoke credentials file", `missing ${credPath}`);
} else {
    try {
        const creds = JSON.parse(readFileSync(credPath, "utf8"));
        if (!creds.email || !creds.password || !creds.companyId) {
            fail("Smoke credentials file", "needs email, password, companyId");
        } else {
            const label = creds.label || creds.companyId;
            pass("Smoke credentials file", label);
            if (credPath.includes("client-0-2")) {
                fail(
                    "Smoke credentials project",
                    "client-0-2 is often production-only — use test-results/ops-centre-staging-credentials.json"
                );
            } else {
                pass("Smoke tenant id", creds.companyId);
            }
        }
    } catch (e) {
        fail("Smoke credentials file", e.message);
    }
}

try {
    const db = getAdminFirestore();
    if (!db) {
        fail("Firestore reachability", "Admin Firestore unavailable");
    } else {
        await db.collection("_ops_smoke_probe").doc("ping").get();
        pass("Firestore reachability", `databaseId=${getFirebaseDatabaseId()}`);
    }
} catch (e) {
    fail("Firestore reachability", e.message?.slice(0, 120) || String(e));
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${failed ? "ALIGNMENT_FAIL" : "ALIGNMENT_PASS"} (${checks.length - failed}/${checks.length})`);
process.exit(failed ? 1 : 0);
