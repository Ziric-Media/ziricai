/**
 * SNET-09 — Mission Control Sarah Network: platform APIs (stats / entities / suspend-reinstate) + console wiring.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity } from "../services/network/networkIdentityService.js";
import { clearNetworkAgentsForTests, getPublicAgent, ensureCompanyAgent } from "../services/network/agentRegistryService.js";
import { clearNetworkAdminAuditForTests, listNetworkAdminAudit } from "../services/network/networkAdminAudit.js";
import { clearNetworkConnectionsForTests, applyConsumerAction } from "../services/network/connectionService.js";
import { clearVerificationCasesForTests } from "../services/network/verificationService.js";
import { resetSearchStatsForTests } from "../services/network/networkSearchStats.js";
import { mountNetworkPlatformRoutes } from "../services/api/networkPlatformRoutes.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";
import { resolveMcNavTarget } from "../services/sarah/mcNavigation.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tick = () => new Promise((r) => setImmediate(r));

async function seed() {
    clearNetworkEntitiesForTests();
    clearNetworkAgentsForTests();
    clearNetworkAdminAuditForTests();
    clearNetworkConnectionsForTests();
    clearVerificationCasesForTests();
    resetSearchStatsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    upsertBusinessDirectoryEntry("cafe-1", { discoverability: "public", displayName: "Green Haven Cafe", industry: "Vegan cafe", location: "Sandton", shortDescription: "Coffee.", tags: ["coffee"] });
    upsertBusinessDirectoryEntry("hidden-1", { discoverability: "hidden", displayName: "Hidden Co", industry: "x", location: "y", shortDescription: "z" });
    await tick();
    const ids = {};
    for (const c of [SMILEMORE_DEMO_COMPANY_ID, "cafe-1", "hidden-1"]) ids[c] = (await ensureOrgEntity(c)).snId;
    return ids;
}

async function withServer(fn, guard = (req, _res, next) => ((req.platformAuth = { via: "superadmin", uid: "officer-1" }), next())) {
    const app = express();
    app.use(express.json());
    mountNetworkPlatformRoutes(app, { platformGuard: guard });
    mountNetworkVerificationRoutes(app, { platformGuard: guard });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init = {}) =>
        fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
        return await fn(j);
    } finally {
        server.close();
    }
}

test("stats: entities, verification, agents, relationships and search counters", async () => {
    await seed();
    await ensureCompanyAgent("cafe-1");
    await searchDiscoverCompanies({ q: "submarine periscope" });
    await withServer(async (j) => {
        const { status, body } = await j("/api/platform/network/v1/stats");
        assert.equal(status, 200);
        const s = body.data;
        assert.equal(s.entities.total, 3);
        assert.equal(s.entities.listed, 2, "SmileMore (pilot) + cafe");
        assert.equal(s.agents.active, 1);
        assert.equal(s.connections.total, 0);
        assert.equal(s.search.scope, "in_process_since_restart");
        assert.equal(s.search.zeroResults, 1);
        assert.ok(!JSON.stringify(s).includes("uid"), "no user identifiers in stats");
    });
});

test("entities list: filters, search; detail includes agent + audit; invalid ids rejected", async () => {
    const ids = await seed();
    await withServer(async (j) => {
        const all = (await j("/api/platform/network/v1/entities")).body.data;
        assert.equal(all.total, 3);
        const cafe = all.entities.find((e) => e.companyId === "cafe-1");
        assert.equal(cafe.snId, ids["cafe-1"]);
        assert.equal(cafe.listed, true);
        const hidden = all.entities.find((e) => e.companyId === "hidden-1");
        assert.equal(hidden.listed, false);
        assert.equal(hidden.discoverability, "hidden");

        assert.equal((await j("/api/platform/network/v1/entities?q=green")).body.data.total, 1);
        assert.equal((await j("/api/platform/network/v1/entities?q=" + ids["hidden-1"])).body.data.entities[0].companyId, "hidden-1");
        assert.equal((await j("/api/platform/network/v1/entities?status=suspended")).body.data.total, 0);

        const detail = (await j(`/api/platform/network/v1/entities/${ids["cafe-1"]}`)).body.data;
        assert.equal(detail.entity.displayName, "Green Haven Cafe");
        assert.deepEqual(detail.audit, []);
        assert.equal((await j("/api/platform/network/v1/entities/not-an-id")).status, 400);
    });
});

test("suspend/reinstate: reason required, audited, removes/restores Discover + search + agents + new relationships", async () => {
    const ids = await seed();
    const snId = ids["cafe-1"];
    const agent = await ensureCompanyAgent("cafe-1");
    await withServer(async (j) => {
        const post = (action, reason) => j(`/api/platform/network/v1/entities/${snId}/status`, { method: "POST", body: JSON.stringify({ action, reason }) });

        assert.equal((await post("suspend")).status, 422);
        assert.equal((await post("suspend", "bad")).status, 422);
        assert.equal((await post("explode", "long enough reason")).status, 422);
        assert.equal((await post("reinstate", "long enough reason")).status, 409, "not suspended yet");

        assert.ok((await searchDiscoverCompanies({ q: "green haven" })).companies.length);
        assert.ok(await getPublicAgent(agent.agentSnId));

        const sus = await post("suspend", "Reported for impersonation (case 42)");
        assert.equal(sus.status, 200);
        assert.equal(sus.body.data.entity.status, "suspended");
        assert.equal(sus.body.data.entity.listed, false);
        assert.equal((await post("suspend", "again please")).status, 409);

        assert.equal((await searchDiscoverCompanies({ q: "green haven" })).companies.length, 0, "gone from search immediately");
        assert.equal(await getPublicAgent(agent.agentSnId), null, "agent hidden");
        await assert.rejects(() => applyConsumerAction("u1", snId, "follow"), { code: "COMPANY_NOT_DISCOVERABLE" });
        assert.equal((await j("/api/platform/network/v1/entities?status=suspended")).body.data.entities[0].statusReason, "Reported for impersonation (case 42)");

        const rein = await post("reinstate", "Resolved: identity confirmed");
        assert.equal(rein.body.data.entity.status, "listed");
        assert.ok((await searchDiscoverCompanies({ q: "green haven" })).companies.length, "back in search");
        assert.ok(await getPublicAgent(agent.agentSnId));

        const audit = await listNetworkAdminAudit({ snId });
        assert.deepEqual(audit.map((a) => a.action).sort(), ["entity_reinstated", "entity_suspended"]);
        assert.ok(audit.every((a) => a.actor === "officer-1" && a.detail.reason));
        const detail = (await j(`/api/platform/network/v1/entities/${snId}`)).body.data;
        assert.equal(detail.audit.length, 2);
    });
});

test("reinstating an unlisted (draft) entity does not list it", async () => {
    const ids = await seed();
    const snId = ids["hidden-1"];
    await withServer(async (j) => {
        const post = (action, reason) => j(`/api/platform/network/v1/entities/${snId}/status`, { method: "POST", body: JSON.stringify({ action, reason }) });
        await post("suspend", "precautionary suspension");
        const rein = await post("reinstate", "cleared after review");
        assert.equal(rein.body.data.entity.status, "draft");
        assert.equal(rein.body.data.entity.listed, false);
    });
});

test("platform routes reject callers without platform access", async () => {
    await seed();
    const deny = (_req, res) => res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
    await withServer(async (j) => {
        for (const path of ["/api/platform/network/v1/stats", "/api/platform/network/v1/entities", "/api/platform/network/v1/verification"]) {
            assert.equal((await j(path)).status, 401, path);
        }
        assert.equal((await j("/api/platform/network/v1/entities/x/status", { method: "POST", body: "{}" })).status, 401);
    }, deny);

    // default guard (no seam): no credentials → 401/403, never data
    const app = express();
    mountNetworkPlatformRoutes(app);
    const server = app.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/platform/network/v1/stats`);
        assert.ok([401, 403, 500].includes(res.status));
        assert.notEqual(res.status, 200);
    } finally {
        server.close();
    }
});

test("Mission Control wiring: registry, router, sidebar (source + generated admin/), API client, Sarah nav", () => {
    const read = (p) => readFileSync(join(ROOT, p), "utf8");
    const registry = read("js/admin/core/moduleRegistry.js");
    const router = read("js/admin/router.js");
    const api = read("js/admin/api.js");
    const mod = read("js/admin/modules/sarah-network.js");

    assert.match(registry, /'sarahNetwork'/);
    assert.match(registry, /sarahNetwork: 'Sarah Network'/);
    assert.match(router, /import \{ renderSarahNetwork \} from '\.\/modules\/sarah-network\.js'/);
    assert.match(router, /sarahNetwork: renderSarahNetwork/);
    for (const html of ["ziric-superadmin-console.html", "admin/index.html"]) {
        assert.match(read(html), /data-page="sarahNetwork"/, html);
    }
    for (const fn of [
        "fetchNetworkStats",
        "fetchNetworkEntities",
        "fetchNetworkEntity",
        "changeNetworkEntityStatus",
        "fetchNetworkVerificationQueue",
        "decideNetworkVerification",
    ]) {
        assert.match(api, new RegExp(`export async function ${fn}\\b`));
        assert.match(mod, new RegExp(fn));
    }
    assert.match(mod, /export async function renderSarahNetwork/);
    for (const section of ["Overview", "Entities", "Verification queue"]) assert.ok(mod.includes(section), section);

    // generated admin/ site is in sync with source
    for (const p of ["api.js", "router.js", "core/moduleRegistry.js", "modules/sarah-network.js"]) {
        assert.equal(read(`admin/js/admin/${p}`), read(`js/admin/${p}`), `admin/ copy out of sync: ${p}`);
    }

    assert.deepEqual(resolveMcNavTarget("Sarah Network"), { page: "sarahNetwork", label: "Sarah Network" });
});
