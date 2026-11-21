/**
 * SNET-01a — network reply wiring, network identity (SN-ID entities), durable discover directory.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { createConsentGrant, clearConsentGrantsForTests } from "../services/users/consentGrantService.js";
import {
    submitPersonalToCompanyEnquiry,
    resetSarahNetworkRateLimitsForTests,
} from "../services/sarah/network/sarahNetworkService.js";
import { clearSarahNetworkStoreForTests } from "../services/sarah/network/sarahNetworkStore.js";
import {
    clearNetworkChatLinksForTests,
    ensureNetworkChatThread,
    getNetworkChatMessages,
    listNetworkLinkedConversations,
} from "../services/users/sarahNetworkChatLinkService.js";
import {
    assertCompanyDiscoverableAsync,
    clearBusinessDirectoryForTests,
    listDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import {
    clearNetworkEntitiesForTests,
    ensureOrgEntity,
    getEntityBySnId,
    getOrgEntityByCompanyId,
} from "../services/network/networkIdentityService.js";
import { isValidSnId, mintSnId, snIdKind } from "../services/network/snId.js";
import { mountNetworkEntityRoutes } from "../services/api/networkEntityRoutes.js";

function resetAll() {
    clearConsentGrantsForTests();
    clearSarahNetworkStoreForTests();
    clearNetworkChatLinksForTests();
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    resetSarahNetworkRateLimitsForTests();
}

test("network thread shows the company answer from payload.naturalLanguage (real dispatch shape)", async () => {
    resetAll();
    const conv = await ensureNetworkChatThread({
        requestId: "req_snet01a_shape",
        source: { userId: "user_snet" },
        destination: { companyId: SMILEMORE_DEMO_COMPANY_ID },
        payload: { naturalLanguage: "Do you offer braces?" },
        response: { status: "completed", payload: { naturalLanguage: "Yes, orthodontic consults." } },
    });
    const msgs = getNetworkChatMessages(conv.id);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].role, "assistant");
    assert.equal(msgs[1].content, "Yes, orthodontic consults.");
});

test("submitPersonalToCompanyEnquiry → linked thread contains the company reply", async () => {
    resetAll();
    const uid = "u-snet-e2e";
    const grant = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID });
    const completed = await submitPersonalToCompanyEnquiry(uid, {
        companyId: SMILEMORE_DEMO_COMPANY_ID,
        grantId: grant.grantId,
        naturalLanguage: "Do you accept new patients?",
    });
    const expected = completed.response.payload.naturalLanguage;
    assert.ok(expected);
    const [conv] = listNetworkLinkedConversations(uid);
    const assistant = getNetworkChatMessages(conv.id).filter((m) => m.role === "assistant");
    assert.equal(assistant.length, 1);
    assert.equal(assistant[0].content, expected);
});

test("SN-ID format, kinds and uniqueness", () => {
    const ids = new Set(Array.from({ length: 200 }, () => mintSnId("org")));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.ok(isValidSnId(id), id);
    assert.equal(snIdKind(mintSnId("per")), "per");
    assert.equal(isValidSnId("sn_org_short"), false);
    assert.equal(isValidSnId("smilemore-demo"), false);
    assert.throws(() => mintSnId("nope"), { code: "SN_ID_KIND_INVALID" });
});

test("org entity: create is idempotent, immutable snId, linked to companyId", async () => {
    resetAll();
    const [a, b] = await Promise.all([
        ensureOrgEntity("acme-1a2b", { displayName: "Acme" }),
        ensureOrgEntity("acme-1a2b", { displayName: "Acme" }),
    ]);
    assert.equal(a.snId, b.snId);
    assert.ok(isValidSnId(a.snId));
    assert.ok(!a.snId.includes("acme"));
    assert.equal(a.status, "draft");
    assert.deepEqual(a.refs, { companyId: "acme-1a2b" });

    assert.equal((await getEntityBySnId(a.snId)).refs.companyId, "acme-1a2b");
    assert.equal((await getOrgEntityByCompanyId("acme-1a2b")).snId, a.snId);
    assert.equal(await getOrgEntityByCompanyId("other-co"), null);
    assert.equal(await getEntityBySnId("not-an-sn-id"), null);

    const listed = await ensureOrgEntity("acme-1a2b", { status: "listed" });
    assert.equal(listed.snId, a.snId);
    assert.equal(listed.status, "listed");
    assert.equal(listed.version, 2);
});

test("publishing a directory entry creates a listed entity; draft otherwise", async () => {
    resetAll();
    upsertBusinessDirectoryEntry("pub-co", { discoverability: "public", displayName: "Pub Co" });
    upsertBusinessDirectoryEntry("hid-co", { discoverability: "hidden", displayName: "Hidden Co" });
    await new Promise((r) => setImmediate(r));
    assert.equal((await getOrgEntityByCompanyId("pub-co")).status, "listed");
    assert.equal((await getOrgEntityByCompanyId("hid-co")).status, "draft");
});

test("discover list is read from the durable store and seeds SmileMore into it", async () => {
    resetAll();
    /** @type {Map<string, object>} */
    const db = new Map([
        ["durable-co", { companyId: "durable-co", discoverability: "public", displayName: "Durable Co", industry: "Retail", verified: false }],
        ["private-co", { companyId: "private-co", discoverability: "hidden", displayName: "Private Co" }],
    ]);
    setBusinessDirectoryStoreForTests({
        enabled: () => true,
        loadAll: async () => [...db.values()],
        save: async (entry) => {
            db.set(entry.companyId, { ...(db.get(entry.companyId) || {}), ...entry });
        },
    });
    clearBusinessDirectoryForTests();

    const companies = await listDiscoverCompanies();
    const ids = companies.map((c) => c.companyId);
    assert.ok(companies.length >= 2);
    assert.ok(ids.includes(SMILEMORE_DEMO_COMPANY_ID));
    assert.ok(ids.includes("durable-co"));
    assert.ok(!ids.includes("private-co"));
    assert.equal(companies.find((c) => c.companyId === "durable-co").industry, "Retail");
    // seed persisted so the next restart reads it from the store
    assert.equal(db.get(SMILEMORE_DEMO_COMPANY_ID)?.discoverability, "public");

    // a fresh process (cache cleared) can still gate store-only companies
    clearBusinessDirectoryForTests();
    await assertCompanyDiscoverableAsync("durable-co");
    await assert.rejects(() => assertCompanyDiscoverableAsync("private-co"), { code: "COMPANY_NOT_DISCOVERABLE" });
    setBusinessDirectoryStoreForTests(null);
});

test("discover list is never empty in memory mode (SmileMore pilot seed)", async () => {
    resetAll();
    const companies = await listDiscoverCompanies();
    assert.ok(companies.some((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID));
});

test("entity routes require authentication / tenant scope", async () => {
    resetAll();
    const entity = await ensureOrgEntity("route-co", { displayName: "Route Co" });
    const app = express();
    mountNetworkEntityRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;

        let res = await fetch(`${base}/api/network/v1/entities?companyId=route-co`);
        assert.ok([401, 403].includes(res.status), `unauth by company → ${res.status}`);
        assert.equal((await res.json()).ok, false);

        res = await fetch(`${base}/api/network/v1/entities/${entity.snId}`);
        assert.ok([401, 403].includes(res.status), `unauth by snId → ${res.status}`);

        res = await fetch(`${base}/api/network/v1/entities/${mintSnId("org")}`);
        assert.equal(res.status, 404);

        res = await fetch(`${base}/api/network/v1/entities`);
        assert.equal(res.status, 400);
    } finally {
        server.close();
    }
});
