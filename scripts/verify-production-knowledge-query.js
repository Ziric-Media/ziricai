#!/usr/bin/env node
/**
 * Production diagnostic: tenant documents list (unfiltered + knowledgeBaseId filter).
 * Intended for Railway: npx @railway/cli run node scripts/verify-production-knowledge-query.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const COMPANY_ID = process.env.QUERY_TEST_COMPANY_ID || "central-motors-rtb";
const KB_ID = process.env.QUERY_TEST_KB_ID || "rtb-kb-1";

async function main() {
    const { getStorageAdapter, getConfiguredStorageBackend, getStorageFallbackReason } = await import(
        "../services/storage/storageAdapter.js"
    );
    const { hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
    const { TenantRepository } = await import("../services/database/tenantRepository.js");
    const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");

    const adapter = await getStorageAdapter();
    console.log("Storage adapter:", adapter.name);
    console.log("STORAGE_BACKEND:", getConfiguredStorageBackend());
    console.log("Admin credentials:", hasAdminCredentials() ? "yes" : "no");
    if (getStorageFallbackReason()) {
        console.log("Storage fallback:", getStorageFallbackReason());
    }
    console.log("Company:", COMPANY_ID);
    console.log("");

    const repo = new TenantRepository(TENANT_COLLECTIONS.DOCUMENTS);
    let ok = true;

    try {
        const unfiltered = await repo.list(COMPANY_ID, { max: 5 });
        console.log(`✓ Unfiltered documents.list → ${unfiltered.length} item(s)`);
    } catch (err) {
        console.error(`✗ Unfiltered documents.list → ${err.message}`);
        ok = false;
    }

    try {
        const filtered = await repo.list(COMPANY_ID, {
            max: 5,
            filters: { knowledgeBaseId: KB_ID },
        });
        console.log(`✓ Filtered knowledgeBaseId == ${KB_ID} → ${filtered.length} item(s)`);
    } catch (err) {
        console.error(`✗ Filtered knowledgeBaseId == ${KB_ID} → ${err.message}`);
        ok = false;
    }

    if (!ok) process.exit(1);
    console.log("\nProduction knowledge query diagnostics passed.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
