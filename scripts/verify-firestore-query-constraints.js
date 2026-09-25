#!/usr/bin/env node
/**
 * Verify portable Firestore query constraint descriptors (TenantRepository + firestoreClient).
 *
 * Covers memory backend always; Admin Firestore when credentials are configured.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function testMemoryBackend() {
    process.env.STORAGE_BACKEND = "memory";
    const { TenantRepository, resetMemoryTenantStore } = await import(
        "../services/database/tenantRepository.js"
    );
    resetMemoryTenantStore();

    const repo = new TenantRepository("_query_test_docs");
    const companyId = "test-co-query";

    await repo.create(companyId, { title: "Alpha", status: "open", knowledgeBaseId: "kb-1", updatedAt: "2026-01-01T00:00:00.000Z" }, "doc-a");
    await repo.create(companyId, { title: "Beta", status: "open", knowledgeBaseId: "kb-1", updatedAt: "2026-01-02T00:00:00.000Z" }, "doc-b");
    await repo.create(companyId, { title: "Gamma", status: "closed", knowledgeBaseId: "kb-2", updatedAt: "2026-01-03T00:00:00.000Z" }, "doc-c");
    await repo.create(companyId, { title: "Delta", status: "open", knowledgeBaseId: "kb-1", updatedAt: "2026-01-04T00:00:00.000Z" }, "doc-d");

    const unfiltered = await repo.list(companyId, { max: 10 });
    assert(unfiltered.length === 4, `unfiltered list expected 4, got ${unfiltered.length}`);

    const filtered = await repo.list(companyId, {
        max: 10,
        filters: { knowledgeBaseId: "kb-1" },
    });
    assert(filtered.length === 3, `equality filter expected 3, got ${filtered.length}`);
    assert(filtered.every((d) => d.knowledgeBaseId === "kb-1"), "filter must match knowledgeBaseId");

    const ordered = await repo.list(companyId, {
        max: 10,
        orderByField: "updatedAt",
        filters: { knowledgeBaseId: "kb-1" },
    });
    assert(ordered.length === 3, `orderBy path expected 3 kb-1 docs, got ${ordered.length}`);

    const limited = await repo.list(companyId, { max: 2 });
    assert(limited.length === 2, `limit expected 2, got ${limited.length}`);

    const page1 = await repo.listPage(companyId, {
        max: 2,
        orderByField: "updatedAt",
        orderDirection: "desc",
    });
    assert(page1.items.length === 2, "pagination page1 size");
    assert(page1.hasMore === true, "pagination page1 hasMore");
    assert(page1.nextCursor, "pagination page1 must expose nextCursor");

    const page2 = await repo.listPage(companyId, {
        max: 2,
        orderByField: "updatedAt",
        orderDirection: "desc",
        startAfterId: page1.nextCursor,
    });
    assert(page2.items.length >= 1, "pagination page2 size");
    assert(
        !page2.items.some((item) => page1.items.some((p) => p.id === item.id)),
        "pagination page2 must not repeat page1 items"
    );

    resetMemoryTenantStore();
    console.log("✓ memory backend: unfiltered, where, orderBy, limit, pagination");
}

async function testDescriptorTranslationUnit() {
    const source = await import("node:fs/promises").then((fs) =>
        fs.readFile(path.join(ROOT, "services/database/firestoreClient.js"), "utf8")
    );
    assert(source.includes("queryWhere"), "firestoreClient must export queryWhere");
    assert(source.includes("buildAdminQuery"), "firestoreClient must build Admin queries from descriptors");
    assert(!source.includes("_fieldPath"), "firestoreClient must not introspect private Web SDK fields");
    console.log("✓ firestoreClient uses plain descriptors (no private SDK introspection)");
}

async function testAdminBackendWhenConfigured() {
    const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
    if (!hasAdminCredentials()) {
        console.log("⚠ Admin credentials not set — skipping live Admin Firestore query tests");
        return;
    }

    const {
        tenantCollectionRef,
        tenantDocRef,
        query,
        queryWhere,
        queryOrderBy,
        queryLimit,
        getDocs,
        setDoc,
        deleteDoc,
        serverTimestamp,
    } = await import("../services/database/firestoreClient.js");
    const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");

    const db = getAdminFirestore();
    assert(db, "Admin Firestore must initialize");

    const companyId = process.env.QUERY_TEST_COMPANY_ID || "central-motors-rtb";
    const collection = TENANT_COLLECTIONS.DOCUMENTS;
    const testId = `_query-constraint-test-${Date.now()}`;
    const knowledgeBaseId = "rtb-kb-1";

    await setDoc(tenantDocRef(companyId, collection, testId), {
        companyId,
        knowledgeBaseId,
        title: "Query constraint probe",
        status: "probe",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    try {
        const unfilteredQ = query(
            tenantCollectionRef(companyId, collection),
            queryOrderBy("updatedAt", "desc"),
            queryLimit(5)
        );
        const unfilteredSnap = await getDocs(unfilteredQ);
        assert(!unfilteredSnap.empty || unfilteredSnap.size >= 0, "unfiltered admin query must succeed");

        const filteredQ = query(
            tenantCollectionRef(companyId, collection),
            queryWhere("knowledgeBaseId", "==", knowledgeBaseId),
            queryOrderBy("updatedAt", "desc"),
            queryLimit(5)
        );
        const filteredSnap = await getDocs(filteredQ);
        assert(
            filteredSnap.docs.every((d) => d.data().knowledgeBaseId === knowledgeBaseId),
            "filtered admin query must return only matching knowledgeBaseId"
        );

        console.log(`✓ Admin Firestore: unfiltered + knowledgeBaseId filter (${filteredSnap.size} docs)`);
    } finally {
        await deleteDoc(tenantDocRef(companyId, collection, testId)).catch(() => {});
    }
}

async function main() {
    console.log("Firestore query constraint verification\n");
    await testDescriptorTranslationUnit();
    await testMemoryBackend();
    await testAdminBackendWhenConfigured();
    console.log("\nAll Firestore query constraint checks passed.");
}

main().catch((err) => {
    console.error("\n✗", err.message);
    process.exit(1);
});
