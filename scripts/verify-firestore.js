#!/usr/bin/env node
/**
 * Verify Firestore connectivity for ZiricAI production setup.
 *
 * Usage:
 *   npm run verify:firestore
 *   STORAGE_BACKEND=firestore node scripts/verify-firestore.js
 *
 * Requires Firebase Admin credentials on Railway/server:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   or GOOGLE_APPLICATION_CREDENTIALS_JSON
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const { hasAdminCredentials, getAdminFirestore, getAdminInitError } = await import(
    "../services/database/firestoreAdmin.js"
);
const { getFirebaseConfig, getFirebaseProjectId } = await import("../js/firebase-config.js");
const { ROOT: SCHEMA_ROOT, TENANT_COLLECTIONS } = await import("../services/database/schema.js");
const { getStorageAdapter, getConfiguredStorageBackend, getStorageFallbackReason } = await import(
    "../services/storage/storageAdapter.js"
);

function pass(label, detail = "") {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    console.log("ZiricAI Firestore connectivity check\n");

    const config = getFirebaseConfig();
    const projectId = getFirebaseProjectId();
    console.log(`Project ID: ${projectId}`);
    console.log(`STORAGE_BACKEND: ${process.env.STORAGE_BACKEND || getConfiguredStorageBackend()}`);
    console.log(`Admin credentials: ${hasAdminCredentials() ? "yes" : "no"}`);
    if (config.apiKey && !config.apiKey.startsWith("your_")) {
        pass("Client Firebase config", `apiKey set (${config.apiKey.slice(0, 8)}…)`);
    } else {
        fail("Client Firebase config", "set FIREBASE_API_KEY in .env or Netlify build env");
    }

    let ok = true;

    if (hasAdminCredentials()) {
        const db = getAdminFirestore();
        if (!db) {
            fail("Admin SDK init", getAdminInitError() || "unknown");
            ok = false;
        } else {
            pass("Admin SDK initialized");
            try {
                await db.collection(SCHEMA_ROOT.COMPANIES).limit(1).get();
                pass("Read companies collection");
            } catch (err) {
                fail("Read companies collection", err.message);
                ok = false;
            }

            try {
                await db.collection(SCHEMA_ROOT.USERS).limit(1).get();
                pass("Read users collection");
            } catch (err) {
                fail("Read users collection", err.message);
                ok = false;
            }

            const sampleCompany = process.env.DEFAULT_COMPANY_ID || "demo-central-motors";
            const tenantPath = `${SCHEMA_ROOT.COMPANIES}/${sampleCompany}/${TENANT_COLLECTIONS.CUSTOMERS}`;
            try {
                await db.collection(tenantPath).limit(1).get();
                pass("Read tenant customers", tenantPath);
            } catch (err) {
                fail("Read tenant customers", err.message);
                ok = false;
            }
        }
    } else {
        fail(
            "Admin SDK",
            "set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (Railway) or GOOGLE_APPLICATION_CREDENTIALS_JSON"
        );
        ok = false;
    }

    const adapter = await getStorageAdapter();
    console.log(`\nResolved storage adapter: ${adapter.name}`);
    if (adapter.name === "firestore") {
        pass("Storage adapter", "firestore");
        try {
            await adapter.ping();
            pass("Storage ping");
        } catch (err) {
            fail("Storage ping", err.message);
            ok = false;
        }
    } else {
        const reason = getStorageFallbackReason();
        fail("Storage adapter", reason || "expected firestore when STORAGE_BACKEND=firestore");
        ok = false;
    }

    console.log("");
    if (ok) {
        console.log("All checks passed. Firestore is linked and reachable.");
        process.exit(0);
    } else {
        console.log("Some checks failed. See docs/deployment/FIRESTORE_PRODUCTION.md");
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
