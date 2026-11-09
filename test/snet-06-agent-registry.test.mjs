/**
 * SNET-06 — agent registry: one idempotent Company Sarah agent per org, public capability facet, no internals leaked.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearBusinessDirectoryForTests,
    invalidateDirectoryEntity,
    listDiscoverCards,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import {
    clearNetworkEntitiesForTests,
    getEntityBySnId,
    setOrgEntityStatus,
} from "../services/network/networkIdentityService.js";
import {
    AGENT_CAPABILITIES,
    clearNetworkAgentsForTests,
    ensureCompanyAgent,
    getAgentByCompanyId,
    getPublicAgent,
    listPublicAgents,
    updateCompanyAgent,
} from "../services/network/agentRegistryService.js";
import { getPublicProfileBySnId } from "../services/network/networkProfileService.js";
import { mountNetworkAgentRoutes } from "../services/api/networkAgentRoutes.js";
import { isValidSnId } from "../services/network/snId.js";

const tick = () => new Promise((r) => setImmediate(r));

async function seed() {
    clearNetworkEntitiesForTests();
    clearNetworkAgentsForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    upsertBusinessDirectoryEntry("cafe-1", {
        discoverability: "public",
        displayName: "Green Haven Cafe",
        industry: "Vegan cafe",
        location: "Sandton",
        shortDescription: "Coffee.",
        languages: ["English"],
    });
    upsertBusinessDirectoryEntry("hidden-1", { discoverability: "hidden", displayName: "Hidden Co", industry: "x", location: "y", shortDescription: "z" });
    await tick();
}

test("provisioning is idempotent and concurrent-safe; ids are opaque sn_ai_", async () => {
    await seed();
    const [a, b, c] = await Promise.all([ensureCompanyAgent("cafe-1"), ensureCompanyAgent("cafe-1"), ensureCompanyAgent("cafe-1")]);
    assert.ok(isValidSnId(a.agentSnId));
    assert.match(a.agentSnId, /^sn_ai_/);
    assert.equal(a.agentSnId, b.agentSnId);
    assert.equal(a.agentSnId, c.agentSnId);
    assert.equal((await ensureCompanyAgent("cafe-1")).agentSnId, a.agentSnId);
    assert.equal((await getAgentByCompanyId("cafe-1")).agentSnId, a.agentSnId);
    assert.ok(!a.agentSnId.includes("cafe"), "never derived from companyId");
    assert.match(a.ownerSnId, /^sn_org_/);
    assert.equal(a.status, "active");
    assert.notEqual((await ensureCompanyAgent("other-co")).agentSnId, a.agentSnId);
});

test("public directory: lists listed orgs only; capability filter; unknown capability rejected", async () => {
    await seed();
    const all = await listPublicAgents();
    const owners = all.agents.map((x) => x.owner.displayName).sort();
    assert.deepEqual(owners, ["Green Haven Cafe", "SmileMore Dentists"]);
    assert.deepEqual(all.capabilities, [...AGENT_CAPABILITIES]);

    const booking = await listPublicAgents({ capability: "book_appointments" });
    assert.deepEqual(booking.agents.map((x) => x.owner.displayName), ["SmileMore Dentists"]);
    assert.ok(booking.agents[0].owner.verified, "owner verified badge is surfaced");

    await assert.rejects(() => listPublicAgents({ capability: "launch_rockets" }), (e) => e.status === 422);
});

test("public card exposes only the whitelisted facet — no companyId, prompts, KB or secrets", async () => {
    await seed();
    const { agents } = await listPublicAgents();
    const card = agents[0];
    assert.deepEqual(Object.keys(card).sort(), ["agentSnId", "capabilities", "displayName", "humanHandover", "kind", "languages", "owner", "role", "status"]);
    assert.deepEqual(Object.keys(card.owner).sort(), ["displayName", "snId", "verified"]);
    const blob = JSON.stringify(card);
    for (const bad of ["companyId", "systemPrompt", "knowledge", "apiKey", "secret", "cafe-1", SMILEMORE_DEMO_COMPANY_ID]) {
        assert.ok(!blob.includes(bad), `leaked ${bad}`);
    }
});

test("agent visibility follows owner listing, suspension and pause", async () => {
    await seed();
    const cafe = await ensureCompanyAgent("cafe-1");
    assert.ok(await getPublicAgent(cafe.agentSnId));

    const hidden = await ensureCompanyAgent("hidden-1");
    assert.equal(await getPublicAgent(hidden.agentSnId), null, "unlisted owner → not public");

    await updateCompanyAgent("cafe-1", { status: "paused" });
    assert.equal(await getPublicAgent(cafe.agentSnId), null, "paused → not public");
    assert.ok(!(await listPublicAgents()).agents.some((a) => a.agentSnId === cafe.agentSnId));
    await updateCompanyAgent("cafe-1", { status: "active" });
    assert.ok(await getPublicAgent(cafe.agentSnId));

    await setOrgEntityStatus("cafe-1", "suspended", { reason: "test", actor: "t" });
    invalidateDirectoryEntity("cafe-1");
    assert.equal(await getPublicAgent(cafe.agentSnId), null, "suspended owner → agent hidden");
    assert.equal(await getPublicAgent("not-an-id"), null);
});

test("owner updates are validated; internals not editable", async () => {
    await seed();
    const updated = await updateCompanyAgent("cafe-1", { capabilities: ["answer_enquiries", "take_orders", "take_orders"] });
    assert.deepEqual(updated.capabilities, ["answer_enquiries", "take_orders"]);
    await assert.rejects(() => updateCompanyAgent("cafe-1", { capabilities: ["telepathy"] }), (e) => e.code === "AGENT_INVALID");
    await assert.rejects(() => updateCompanyAgent("cafe-1", { capabilities: [] }), (e) => e.code === "AGENT_INVALID");
    await assert.rejects(() => updateCompanyAgent("cafe-1", { systemPrompt: "x" }), (e) => e.code === "AGENT_FIELD_NOT_ALLOWED");
    await assert.rejects(() => updateCompanyAgent("cafe-1", { status: "retired" }), (e) => e.code === "AGENT_INVALID");
    assert.equal((await ensureCompanyAgent("cafe-1")).capabilities.length, 2, "re-provisioning never overwrites");
});

test("public entity profile carries the agent summary", async () => {
    await seed();
    const card = (await listDiscoverCards()).find((c) => c.companyId === "cafe-1");
    assert.ok(card?.snId);
    const profile = await getPublicProfileBySnId(card.snId);
    assert.match(profile.agent.agentSnId, /^sn_ai_/);
    assert.ok(profile.agent.capabilities.includes("human_handover"));
    assert.equal((await getEntityBySnId(card.snId)).kind, "org");
});

test("API: consumer list/get, tenant read/update with permissions", async () => {
    await seed();
    const app = express();
    app.use(express.json());
    mountNetworkAgentRoutes(app, {
        consumerGuard: (req, _res, next) => next(),
        authorize: async (req, companyId, { write }) => {
            if (req.headers["x-role"] === "none") throw Object.assign(new Error("no"), { status: 403, code: "PERMISSION_DENIED" });
            if (write && req.headers["x-role"] === "agent") throw Object.assign(new Error("no"), { status: 403, code: "PERMISSION_DENIED" });
            return { uid: "u1", companyId };
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const j = (path, init) => fetch(base + path, init).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
        const list = await j("/api/network/v1/agents?capability=book_appointments");
        assert.equal(list.status, 200);
        assert.equal(list.body.data.agents.length, 1);
        const id = list.body.data.agents[0].agentSnId;
        assert.equal((await j(`/api/network/v1/agents/${id}`)).body.data.agent.agentSnId, id);
        assert.equal((await j("/api/network/v1/agents/sn_ai_NOTEXISTING00000")).status, 404);
        assert.equal((await j("/api/network/v1/agents?capability=nope")).status, 422);

        const own = await j("/api/network/v1/orgs/cafe-1/agent");
        assert.equal(own.status, 200);
        assert.ok(own.body.data.agent.agentSnId);

        const put = await j("/api/network/v1/orgs/cafe-1/agent", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capabilities: ["customer_support"], status: "paused" }),
        });
        assert.equal(put.status, 200);
        assert.equal(put.body.data.agent.status, "paused");

        const denied = await j("/api/network/v1/orgs/cafe-1/agent", {
            method: "PUT",
            headers: { "content-type": "application/json", "x-role": "agent" },
            body: JSON.stringify({ status: "active" }),
        });
        assert.equal(denied.status, 403);
        const bad = await j("/api/network/v1/orgs/cafe-1/agent", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ systemPrompt: "leak" }),
        });
        assert.equal(bad.status, 422);
    } finally {
        server.close();
    }
});

test("public agent routes require consumer auth by default", async () => {
    const app = express();
    mountNetworkAgentRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const p of ["/api/network/v1/agents", "/api/network/v1/agents/sn_ai_0000000000000000"]) {
            const res = await fetch(base + p);
            assert.ok([401, 403].includes(res.status), `${p} → ${res.status}`);
        }
    } finally {
        server.close();
    }
});
