#!/usr/bin/env node
/**
 * Phase 2 migration — move legacy flat Firestore collections into tenant paths.
 *
 * Legacy → Target:
 *   customers/{phone}           → companies/{companyId}/customers/{phone}
 *   customers/{phone}/messages  → companies/{companyId}/customers/{phone}/messages
 *   agents/{agentId}              → companies/{companyId}/aiEmployees/{agentId}
 *   knowledge/{docId}             → companies/{companyId}/documents/{docId}
 *
 * Usage:
 *   node scripts/migrate-demo-to-tenants.js
 *   node scripts/migrate-demo-to-tenants.js --companyId=demo-central-motors
 *   node scripts/migrate-demo-to-tenants.js --dry-run
 *
 * Requires Firebase credentials (same as server.js via js/firebase.js).
 */
import dotenv from "dotenv";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    writeBatch,
    query,
    limit,
} from "firebase/firestore";
import { db } from "../js/firebase.js";
import {
    ROOT,
    TENANT_COLLECTIONS,
    LEGACY_COLLECTIONS,
    tenantCollectionPath,
} from "../services/database/schema.js";

dotenv.config();

const BATCH_SIZE = 400;

function parseArgs(argv) {
    const args = { companyId: process.env.DEFAULT_COMPANY_ID || "demo-central-motors", dryRun: false };
    for (const arg of argv) {
        if (arg === "--dry-run") args.dryRun = true;
        else if (arg.startsWith("--companyId=")) args.companyId = arg.split("=")[1];
    }
    return args;
}

function nowIso() {
    return new Date().toISOString();
}

function migrationMeta(legacyId, sourcePath) {
    return {
        migratedAt: nowIso(),
        legacyId,
        legacyPath: sourcePath,
        migrationScript: "migrate-demo-to-tenants.js",
    };
}

async function commitBatch(batch, dryRun, label) {
    if (dryRun) {
        console.log(`[dry-run] Would commit batch: ${label}`);
        return;
    }
    await batch.commit();
    console.log(`[migrate] Committed batch: ${label}`);
}

/**
 * Migrate root customers + nested messages into tenant scope.
 */
async function migrateCustomers(companyId, dryRun) {
    const snap = await getDocs(query(collection(db, LEGACY_COLLECTIONS.CUSTOMERS), limit(5000)));
    let batch = writeBatch(db);
    let ops = 0;
    let migrated = 0;

    for (const customerSnap of snap.docs) {
        const phone = customerSnap.id;
        const data = customerSnap.data();
        const resolvedCompanyId = data.companyId || companyId;
        const targetRef = doc(
            db,
            ROOT.COMPANIES,
            resolvedCompanyId,
            TENANT_COLLECTIONS.CUSTOMERS,
            phone
        );

        batch.set(
            targetRef,
            {
                ...data,
                companyId: resolvedCompanyId,
                phone: data.phone || phone,
                ...migrationMeta(phone, `${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`),
            },
            { merge: true }
        );
        ops++;
        migrated++;

        const messagesSnap = await getDocs(collection(db, LEGACY_COLLECTIONS.CUSTOMERS, phone, "messages"));
        for (const msgSnap of messagesSnap.docs) {
            const msgRef = doc(
                db,
                ROOT.COMPANIES,
                resolvedCompanyId,
                TENANT_COLLECTIONS.CUSTOMERS,
                phone,
                "messages",
                msgSnap.id
            );
            batch.set(msgRef, { ...msgSnap.data(), ...migrationMeta(msgSnap.id, `${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}/messages/${msgSnap.id}`) }, { merge: true });
            ops++;

            if (ops >= BATCH_SIZE) {
                await commitBatch(batch, dryRun, `customers batch (${migrated} customers so far)`);
                batch = writeBatch(db);
                ops = 0;
            }
        }

        if (ops >= BATCH_SIZE) {
            await commitBatch(batch, dryRun, `customers batch (${migrated} customers so far)`);
            batch = writeBatch(db);
            ops = 0;
        }
    }

    if (ops > 0) {
        await commitBatch(batch, dryRun, `customers final (${migrated} total)`);
    }

    return { collection: LEGACY_COLLECTIONS.CUSTOMERS, count: migrated };
}

/**
 * Migrate root agents → tenant aiEmployees.
 */
async function migrateAgents(defaultCompanyId, dryRun) {
    const snap = await getDocs(query(collection(db, LEGACY_COLLECTIONS.AGENTS), limit(2000)));
    let batch = writeBatch(db);
    let ops = 0;
    let migrated = 0;

    for (const agentSnap of snap.docs) {
        const agentId = agentSnap.id;
        const data = agentSnap.data();
        const resolvedCompanyId = data.companyId || defaultCompanyId;
        const targetRef = doc(
            db,
            ROOT.COMPANIES,
            resolvedCompanyId,
            TENANT_COLLECTIONS.AI_EMPLOYEES,
            agentId
        );

        batch.set(
            targetRef,
            {
                ...data,
                companyId: resolvedCompanyId,
                ...migrationMeta(agentId, `${LEGACY_COLLECTIONS.AGENTS}/${agentId}`),
            },
            { merge: true }
        );
        ops++;
        migrated++;

        if (ops >= BATCH_SIZE) {
            await commitBatch(batch, dryRun, `agents batch (${migrated} so far)`);
            batch = writeBatch(db);
            ops = 0;
        }
    }

    if (ops > 0) {
        await commitBatch(batch, dryRun, `agents final (${migrated} total)`);
    }

    return { collection: LEGACY_COLLECTIONS.AGENTS, count: migrated };
}

/**
 * Migrate root knowledge → tenant documents.
 */
async function migrateKnowledge(defaultCompanyId, dryRun) {
    const snap = await getDocs(query(collection(db, LEGACY_COLLECTIONS.KNOWLEDGE), limit(5000)));
    let batch = writeBatch(db);
    let ops = 0;
    let migrated = 0;

    for (const docSnap of snap.docs) {
        const docId = docSnap.id;
        const data = docSnap.data();
        const resolvedCompanyId = data.companyId || defaultCompanyId;
        const targetRef = doc(
            db,
            ROOT.COMPANIES,
            resolvedCompanyId,
            TENANT_COLLECTIONS.DOCUMENTS,
            docId
        );

        batch.set(
            targetRef,
            {
                ...data,
                companyId: resolvedCompanyId,
                ...migrationMeta(docId, `${LEGACY_COLLECTIONS.KNOWLEDGE}/${docId}`),
            },
            { merge: true }
        );
        ops++;
        migrated++;

        if (ops >= BATCH_SIZE) {
            await commitBatch(batch, dryRun, `knowledge batch (${migrated} so far)`);
            batch = writeBatch(db);
            ops = 0;
        }
    }

    if (ops > 0) {
        await commitBatch(batch, dryRun, `knowledge final (${migrated} total)`);
    }

    return { collection: LEGACY_COLLECTIONS.KNOWLEDGE, count: migrated };
}

async function ensureCompanyRoot(companyId, dryRun) {
    const ref = doc(db, ROOT.COMPANIES, companyId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
        console.log(`[migrate] Company root exists: ${tenantCollectionPath(companyId, "")}`);
        return;
    }

    const payload = {
        id: companyId,
        name: companyId,
        status: "active",
        plan: "starter",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        provisionedAt: nowIso(),
        migratedAt: nowIso(),
    };

    if (dryRun) {
        console.log(`[dry-run] Would create company root: companies/${companyId}`);
        return;
    }

    await setDoc(ref, payload, { merge: true });
    console.log(`[migrate] Created company root: companies/${companyId}`);
}

async function main() {
    const { companyId, dryRun } = parseArgs(process.argv.slice(2));

    console.log("==================================");
    console.log("ZiricAI Phase 2 Migration");
    console.log(`Default companyId: ${companyId}`);
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
    console.log("==================================");

    await ensureCompanyRoot(companyId, dryRun);

    const results = [];
    results.push(await migrateCustomers(companyId, dryRun));
    results.push(await migrateAgents(companyId, dryRun));
    results.push(await migrateKnowledge(companyId, dryRun));

    console.log("");
    console.log("Migration summary:");
    for (const r of results) {
        console.log(`  ${r.collection}: ${r.count} documents`);
    }
    console.log("");
    console.log(dryRun ? "Dry run complete — no writes performed." : "Migration complete.");
}

main().catch((err) => {
    console.error("[migrate] Fatal:", err);
    process.exit(1);
});
