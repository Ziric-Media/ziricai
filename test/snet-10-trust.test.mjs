/**
 * SNET-10 — trust & safety: report an entity, pseudonymous moderation queue, audited decisions, MC wiring.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
    upsertBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, ensureOrgEntity, getOrgEntityByCompanyId } from "../services/network/networkIdentityService.js";
import { clearNetworkAdminAuditForTests, listNetworkAdminAudit } from "../services/network/networkAdminAudit.js";
import { clearModerationCasesForTests } from "../services/network/moderationService.js";
import { mountNetworkTrustRoutes } from "../services/api/networkTrustRoutes.js";
import { mountNetworkPlatformRoutes } from "../services/api/networkPlatformRoutes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tick = () => new Promise((r) => setImmediate(r));

async function seed(extra = 0) {
    clearNetworkEntitiesForTests();
    clearNetworkAdminAuditForTests();
    clearModerationCasesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    upsertBusinessDirectoryEntry("cafe-1", { discoverability: "public", displayName: "Green Haven Cafe", industry: "Vegan cafe", location: "Sandton", shortDescription: "Coffee.", tags: ["coffee"] });
    upsertBusinessDirectoryEntry("hidden-1", { discoverability: "hidden", displayName: "Hidden Co", industry: "x", location: "y", shortDescription: "z" });
    for (let i = 1; i <= extra; i += 1) {
        upsertBusinessDirectoryEntry(`bulk-${i}`, { discoverability: "public", displayName: `Bulk ${i}`, industry: "x", location: "y", shortDescription: "z" });
    }
    await tick();
    const ids = {};
    for (const c of ["cafe-1", "hidden-1", ...Array.from({ length: extra }, (_, i) => `bulk-${i + 1}`)]) ids[c] = (await ensureOrgEntity(c)).snId;
    return ids;
}

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    mountNetworkTrustRoutes(app, {
        consumerGuard: (req, _res, next) => {
            req.consumerAuth = { uid: String(req.headers["x-uid"] || "reporter-1") };
            next();
        },
        platformGuard: (req, _res, next) => {
            req.platformAuth = { via: "superadmin", uid: "moderator-1" };
            next();
        },
    });
    mountNetworkPlatformRoutes(app, { platformGuard: (req, _res, next) => ((req.platformAuth = { via: "superadmin", uid: "moderator-1" }), next()) });
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

const report = (j, snId, body, uid) =>
    j(`/api/network/v1/entities/${snId}/report`, { method: "POST", body: JSON.stringify(body), headers: uid ? { "x-uid": uid } : {} });

test("report validation: reason enum, details rules, visibility, ids", async () => {
    const ids = await seed();
    await withServer(async (j) => {
        assert.equal((await report(j, ids["cafe-1"], {})).status, 422);
        assert.equal((await report(j, ids["cafe-1"], { reason: "bogus" })).status, 422);
        assert.equal((await report(j, ids["cafe-1"], { reason: "other" })).status, 422, "other needs details");
        assert.equal((await report(j, ids["cafe-1"], { reason: "spam", details: "x".repeat(1001) })).status, 422);
        assert.equal((await report(j, ids["hidden-1"], { reason: "spam" })).status, 404, "cannot report what is not listed");
        assert.equal((await report(j, "nope", { reason: "spam" })).status, 400);
        assert.equal((await report(j, "sn_org_0000000000000000", { reason: "spam" })).status, 404);

        const ok = await report(j, ids["cafe-1"], { reason: "impersonation", details: "Pretends to be a bigger chain" });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.data.report.status, "under_review");
        assert.ok(ok.body.data.report.caseId.startsWith("mc_"));
        assert.ok(!JSON.stringify(ok.body).includes("reporter-1"), "reporter uid never echoed");
    });
});

test("duplicate open reports from the same user are idempotent; per-day rate limit applies", async () => {
    const ids = await seed(11);
    await withServer(async (j) => {
        const a = await report(j, ids["cafe-1"], { reason: "spam" });
        const b = await report(j, ids["cafe-1"], { reason: "scam_or_fraud" });
        assert.equal(a.status, 201);
        assert.equal(b.status, 200);
        assert.equal(b.body.data.report.duplicate, true);
        assert.equal(b.body.data.report.caseId, a.body.data.report.caseId);

        let limited = null;
        for (let i = 1; i <= 11; i += 1) {
            const r = await report(j, ids[`bulk-${i}`], { reason: "spam" });
            if (r.status === 429) {
                limited = r;
                break;
            }
        }
        assert.ok(limited, "11th distinct report in a day is rate limited");
        assert.equal(limited.body.error.code, "REPORT_RATE_LIMITED");
        assert.equal((await report(j, ids["cafe-1"], { reason: "spam" }, "someone-else")).status, 201, "other users unaffected");

        const mine = (await j("/api/network/v1/reports")).body.data.reports;
        assert.ok(mine.length >= 10);
        assert.deepEqual(Object.keys(mine[0]).sort(), ["caseId", "createdAt", "reason", "snId", "status", "updatedAt"]);
    });
});

test("platform queue: pseudonymous reporters, priority by distinct reporters, decisions are audited", async () => {
    const ids = await seed();
    const snId = ids["cafe-1"];
    await withServer(async (j) => {
        await report(j, snId, { reason: "spam" }, "u1");
        await report(j, snId, { reason: "scam_or_fraud", details: "took deposit" }, "u2");
        const single = await report(j, ids["hidden-1"] && snId, { reason: "impersonation" }, "u3");
        assert.equal(single.status, 201);

        const queue = (await j("/api/platform/network/v1/moderation")).body.data.cases;
        assert.equal(queue.length, 3);
        assert.ok(queue.every((c) => c.priority === "high"), "3 distinct open reporters → high priority");
        assert.equal(queue[0].openReportsForEntity, 3);
        const blob = JSON.stringify(queue);
        for (const uid of ["u1", "u2", "u3"]) assert.ok(!blob.includes(`"reporterUid"`) && !blob.includes(`"${uid}"`), "no reporter uid in platform view");
        assert.ok(queue.every((c) => /^[0-9a-f]{10}$/.test(c.reporterRef)));
        assert.notEqual(queue[0].reporterRef, queue[1].reporterRef);

        const caseId = queue[0].caseId;
        const decide = (id, body) => j(`/api/platform/network/v1/moderation/${id}/decision`, { method: "POST", body: JSON.stringify(body) });
        assert.equal((await decide(caseId, { action: "nuke" })).status, 400);
        assert.equal((await decide(caseId, { action: "dismiss" })).status, 422, "note required");
        assert.equal((await decide("mc_missing", { action: "start_review" })).status, 404);

        assert.equal((await decide(caseId, { action: "start_review" })).body.data.case.status, "reviewing");
        assert.equal((await decide(caseId, { action: "start_review" })).status, 409);
        const dismissed = await decide(caseId, { action: "dismiss", note: "Not a violation after review" });
        assert.equal(dismissed.body.data.case.status, "dismissed");
        assert.equal((await decide(caseId, { action: "dismiss", note: "again please" })).status, 409);

        const open = (await j("/api/platform/network/v1/moderation?status=open")).body.data.cases;
        assert.equal(open.length, 2);
        assert.equal((await j(`/api/platform/network/v1/moderation/${caseId}`)).body.data.case.status, "dismissed");
        assert.equal((await j("/api/platform/network/v1/moderation/mc_none")).status, 404);

        const audit = await listNetworkAdminAudit({ snId });
        assert.deepEqual(audit.map((a) => a.action).sort(), ["moderation.dismiss", "moderation.start_review"]);
        assert.ok(audit.every((a) => a.actor === "moderator-1"));

        // reporter sees only a status, never the decision note
        const mine = (await j("/api/network/v1/reports", { headers: { "x-uid": queue.find((c) => c.caseId === caseId) && "u1" } })).body.data.reports;
        assert.ok(mine.every((r) => ["under_review", "resolved"].includes(r.status)));
        assert.ok(!JSON.stringify(mine).includes("Not a violation"));
    });
});

test("suspend_entity decision suspends the entity (removed from search), audits both records, and tolerates already-suspended", async () => {
    const ids = await seed();
    const snId = ids["cafe-1"];
    await withServer(async (j) => {
        const r1 = await report(j, snId, { reason: "scam_or_fraud", details: "collects deposits then vanishes" }, "u1");
        const r2 = await report(j, snId, { reason: "impersonation" }, "u2");
        const caseId = r1.body.data.report.caseId;
        assert.ok((await searchDiscoverCompanies({ q: "green haven" })).companies.length);

        const decide = (id, body) => j(`/api/platform/network/v1/moderation/${id}/decision`, { method: "POST", body: JSON.stringify(body) });
        const res = await decide(caseId, { action: "suspend_entity", note: "Confirmed fraud pattern" });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.case.status, "actioned");
        assert.equal((await getOrgEntityByCompanyId("cafe-1")).status, "suspended");
        assert.equal((await searchDiscoverCompanies({ q: "green haven" })).companies.length, 0);

        const audit = (await listNetworkAdminAudit({ snId })).map((a) => a.action).sort();
        assert.deepEqual(audit, ["entity_suspended", "moderation.suspend_entity"]);
        const sus = (await listNetworkAdminAudit({ snId, action: "entity_suspended" }))[0];
        assert.match(sus.detail.reason, new RegExp(caseId));

        // suspended entities can't be reported (not visible) …
        assert.equal((await report(j, snId, { reason: "spam" }, "u9")).status, 404);

        // … and a second open case on an already-suspended entity can still be resolved
        const second = await decide(r2.body.data.report.caseId, { action: "suspend_entity", note: "Same entity, already suspended" });
        assert.equal(second.status, 200);
        assert.equal(second.body.data.case.status, "actioned");
        assert.equal((await listNetworkAdminAudit({ snId, action: "entity_suspended" })).length, 1, "no double suspension");
    });
});

test("stats expose moderation counts; default guards deny anonymous callers", async () => {
    const ids = await seed();
    await withServer(async (j) => {
        await report(j, ids["cafe-1"], { reason: "spam" }, "u1");
        const stats = (await j("/api/platform/network/v1/stats")).body.data;
        assert.equal(stats.moderation.open, 1);
        assert.equal(stats.moderation.total, 1);
    });

    const app = express();
    mountNetworkTrustRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const [method, path] of [
            ["POST", `/api/network/v1/entities/${ids["cafe-1"]}/report`],
            ["GET", "/api/network/v1/reports"],
            ["GET", "/api/platform/network/v1/moderation"],
            ["POST", "/api/platform/network/v1/moderation/mc_x/decision"],
        ]) {
            const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
            assert.ok([401, 403, 500].includes(res.status) && res.status !== 200, `${method} ${path} → ${res.status}`);
        }
    } finally {
        server.close();
    }
});

test("Mission Control moderation tab is wired (source + generated admin/)", () => {
    const read = (p) => readFileSync(join(ROOT, p), "utf8");
    const mod = read("js/admin/modules/sarah-network.js");
    const api = read("js/admin/api.js");
    for (const fn of ["fetchNetworkModeration", "decideNetworkModeration"]) {
        assert.match(api, new RegExp(`export async function ${fn}\\b`));
        assert.match(mod, new RegExp(fn));
    }
    assert.ok(mod.includes("id: 'moderation'") && mod.includes("async function moderationHtml"));
    for (const p of ["api.js", "modules/sarah-network.js"]) {
        assert.equal(read(`admin/js/admin/${p}`), read(`js/admin/${p}`), `admin/ copy out of sync: ${p}`);
    }
});
