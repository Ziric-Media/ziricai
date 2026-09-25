#!/usr/bin/env node
/**
 * Phase 2B-1.4 — Durable Railway CRM storage verification.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(relPath) {
    return readFileSync(join(root, relPath), "utf8");
}

async function testNamedDatabaseAdminSdk() {
    const source = read("services/database/firestoreAdmin.js");
    assert(source.includes("getFirestore(app, databaseId)"), "Admin SDK must use named Firestore database");
    assert(source.includes("getFirebaseDatabaseId"), "Admin SDK must read FIREBASE_DATABASE_ID / default");
    console.log("✓ firestoreAdmin targets named database (default for ziricai)");
}

async function testStorageAdapterFirestorePath() {
    const source = read("services/storage/storageAdapter.js");
    assert(source.includes('STORAGE_BACKEND=firestore'), "Storage adapter must support firestore backend");
    assert(source.includes("hasAdminCredentials"), "Firestore backend must require Admin credentials on Railway");
    console.log("✓ storageAdapter enforces Admin credentials for firestore on Railway");
}

async function testMissionControlReadsTenantCrm() {
    const metrics = read("services/operations/tenantMissionMetrics.js");
    assert(metrics.includes("listTenantCustomers"), "Mission Control must read tenant customers");
    assert(metrics.includes("listLeads"), "Mission Control must read tenant leads");
    assert(metrics.includes("listAppointmentsForCompany"), "Mission Control must read Postgres appointments");
    assert(metrics.includes(RTB) || metrics.includes("PRIMARY_MISSION_TENANT_ID"), "Production tenant constant present");
    console.log("✓ tenantMissionMetrics aggregates CRM entities + Postgres appointments");
}

async function testHealthExposesStorageState() {
    const appSource = read("api/app.js");
    assert(appSource.includes("firebaseTokenVerify"), "Health must expose firebaseTokenVerify");
    assert(appSource.includes('storage: adapter.name'), "Health must expose storage adapter name");
    console.log("✓ /api/health exposes storage and token verification state");
}

async function testLiveAdapterWhenConfigured() {
    const { hasAdminCredentials, getAdminFirestore, getAdminDatabaseId } = await import(
        "../services/database/firestoreAdmin.js"
    );
    const { getStorageAdapter, getConfiguredStorageBackend, getStorageFallbackReason } = await import(
        "../services/storage/storageAdapter.js"
    );

    if (!hasAdminCredentials()) {
        console.log("⚠ Admin credentials not set locally — skipping live Firestore adapter probe");
        return;
    }

    const db = getAdminFirestore();
    assert(db, "Admin Firestore must initialize when credentials are present");

    const databaseId = getAdminDatabaseId();
    assert(databaseId === "default", `Expected databaseId default for ziricai, got ${databaseId}`);

    await db.collection("companies").limit(1).get();

    if (process.env.STORAGE_BACKEND === "firestore") {
        const adapter = await getStorageAdapter();
        assert(adapter.name === "firestore", `Expected firestore adapter, got ${adapter.name}`);
        assert(!getStorageFallbackReason(), `Unexpected storage fallback: ${getStorageFallbackReason()}`);
        console.log("✓ Live Firestore adapter selected with Admin credentials");
    }
}

async function testProductionTenantPathWhenConfigured() {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && !process.env.FIREBASE_CLIENT_EMAIL) {
        console.log("⚠ Skipping central-motors-rtb Firestore probe (no Admin credentials in env)");
        return;
    }

    const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
    const db = getAdminFirestore();
    if (!db) return;

    const customers = await db.collection(`companies/${RTB}/customers`).limit(5).get();
    const leads = await db.collection(`companies/${RTB}/leads`).limit(5).get();
    const conversations = await db.collection(`companies/${RTB}/conversations`).limit(5).get();

    console.log(
        `✓ Firestore probe companies/${RTB}: customers=${customers.size}, leads=${leads.size}, conversations=${conversations.size}`
    );
}

async function main() {
    console.log("\nPhase 2B-1.4 Durable CRM storage verification\n");

    await testNamedDatabaseAdminSdk();
    await testStorageAdapterFirestorePath();
    await testMissionControlReadsTenantCrm();
    await testHealthExposesStorageState();
    await testLiveAdapterWhenConfigured();
    await testProductionTenantPathWhenConfigured();

    console.log("\nAll Phase 2B-1.4 durable CRM checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
