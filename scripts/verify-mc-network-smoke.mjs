#!/usr/bin/env node
/**
 * Gate 3 — Mission Control "Sarah Network" smoke (no browser, no DOM).
 *
 * Proves, deterministically:
 *   1. module files exist (source + generated admin/ copy), are in sync and pass `node --check`
 *   2. the module is registered in the module registry, router and both sidebars
 *   3. no blocking browser dialogs (window.prompt) in the MC / portal network modules
 *   4. every platform endpoint the MC API client calls is a documented route in ROUTE_CATALOG
 *   5. those routes are mounted: anonymous callers are refused, a platform guard gets 200 from /stats
 *   6. the page exposes its tabs (Overview / Entities / Verification queue / Moderation / Search / Access)
 *   7. Phase 2.0 acceptance (browser-less): Search admin + roles routes guarded and working, evidence download route
 *      guarded, geo + notification service paths, and the Sarah App / MC clients wired to them
 *
 * It does NOT render the page — a real-browser smoke after the `admin` deploy is still a manual step.
 *
 * Usage: node scripts/verify-mc-network-smoke.mjs
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ROUTE_CATALOG } from "../services/api/routeRegistry.js";
import { mountNetworkPlatformRoutes } from "../services/api/networkPlatformRoutes.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";
import { mountNetworkTrustRoutes } from "../services/api/networkTrustRoutes.js";
import { resolveMcNavTarget } from "../services/sarah/mcNavigation.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) => s.replace(/\r\n/g, "\n");
const read = (rel) => norm(readFileSync(path.join(ROOT, rel), "utf8"));
const results = [];
const ok = (msg) => {
    results.push(msg);
    console.log(`✓ ${msg}`);
};

// ── 1. files ───────────────────────────────────────────────────────────────
const MODULE_FILES = ["modules/sarah-network.js", "api.js", "router.js", "core/moduleRegistry.js"];
for (const f of MODULE_FILES) {
    for (const base of ["js/admin", "admin/js/admin"]) {
        const rel = `${base}/${f}`;
        assert(existsSync(path.join(ROOT, rel)), `missing ${rel}`);
        execFileSync(process.execPath, ["--check", path.join(ROOT, rel)], { stdio: "pipe" });
    }
    assert.equal(read(`admin/js/admin/${f}`), read(`js/admin/${f}`), `admin/ copy out of sync: ${f}`);
}
assert(existsSync(path.join(ROOT, "js/portal/modules/network.js")), "missing portal network module");
ok(`module files present, syntax-valid and in sync (source ↔ admin/): ${MODULE_FILES.length} files`);

// ── 2. registry / router / sidebars ────────────────────────────────────────
const registry = read("js/admin/core/moduleRegistry.js");
const router = read("js/admin/router.js");
assert.match(registry, /'sarahNetwork'/, "moduleRegistry id");
assert.match(registry, /sarahNetwork: 'Sarah Network'/, "moduleRegistry label");
assert.match(router, /import \{ renderSarahNetwork \} from '\.\/modules\/sarah-network\.js'/, "router import");
assert.match(router, /sarahNetwork: renderSarahNetwork/, "router map");
for (const html of ["ziric-superadmin-console.html", "admin/index.html"]) {
    assert.match(read(html), /data-page="sarahNetwork"/, `sidebar entry in ${html}`);
}
assert.deepEqual(resolveMcNavTarget("Sarah Network"), { page: "sarahNetwork", label: "Sarah Network" });
ok("registered in moduleRegistry, router and both sidebars; Sarah navigation resolves");

// ── 3. no blocking dialogs ─────────────────────────────────────────────────
for (const rel of ["js/admin/modules/sarah-network.js", "admin/js/admin/modules/sarah-network.js", "js/portal/modules/network.js"]) {
    const src = read(rel);
    const hit = src.match(/(?:window\.)?\bprompt\s*\(/);
    assert(!hit, `${rel} uses a blocking prompt() — use a form modal`);
}
ok("no window.prompt in the MC Sarah Network module or the portal network module");

// ── 4. API client ↔ route catalog ──────────────────────────────────────────
const apiSrc = read("js/admin/api.js");
const clientPaths = new Set(
    [...apiSrc.matchAll(/['`](\/api\/platform\/network\/v1\/[^'`]*)['`]/g)].map((m) =>
        m[1]
            .replace(/\$\{encodeURIComponent\([^)]*\)\}/g, ":param") // path params
            .replace(/\$\{[\s\S]*$/, "") // query-string interpolation and anything after it
            .replace(/\?.*$/, "")
            .replace(/\/+$/, "")
    )
);
assert(clientPaths.size >= 8, `expected >= 8 platform network endpoints in the MC API client, found ${clientPaths.size}`);
const canon = (p) => p.replace(/:\w+/g, ":param");
const catalog = new Set(ROUTE_CATALOG.filter((r) => r.path.startsWith("/api/platform/network/v1/")).map((r) => canon(r.path)));
const undocumented = [...clientPaths].filter((p) => !catalog.has(canon(p)));
assert.deepEqual(undocumented, [], `MC client calls endpoints missing from ROUTE_CATALOG: ${undocumented.join(", ")}`);
ok(`all ${clientPaths.size} platform network endpoints used by the MC client are in ROUTE_CATALOG`);

// ── 5. routes are mounted + guarded ────────────────────────────────────────
async function withServer(guard, fn) {
    const app = express();
    app.use(express.json());
    const deps = guard ? { platformGuard: guard } : {};
    mountNetworkPlatformRoutes(app, deps);
    mountNetworkVerificationRoutes(app, deps);
    mountNetworkTrustRoutes(app, deps);
    const server = app.listen(0);
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
}
await withServer(null, async (base) => {
    for (const p of ["/api/platform/network/v1/stats", "/api/platform/network/v1/entities", "/api/platform/network/v1/verification", "/api/platform/network/v1/moderation"]) {
        const res = await fetch(base + p);
        assert([401, 403].includes(res.status), `${p} must refuse anonymous callers (got ${res.status})`);
    }
});
await withServer(
    (req, _res, next) => {
        req.platformAuth = { via: "superadmin", uid: "smoke-officer" };
        next();
    },
    async (base) => {
        const stats = await fetch(`${base}/api/platform/network/v1/stats`);
        assert.equal(stats.status, 200, "stats with a platform guard");
        const body = await stats.json();
        assert.equal(body.ok, true);
        assert(body.data?.entities, "stats.entities present");
        const list = await fetch(`${base}/api/platform/network/v1/entities`);
        assert.equal(list.status, 200, "entities with a platform guard");
    }
);
ok("platform routes are mounted: anonymous refused, guarded stats/entities return 200");

// ── 6. page structure ──────────────────────────────────────────────────────
const mod = read("js/admin/modules/sarah-network.js");
assert.match(mod, /export async function renderSarahNetwork/);
for (const tab of ["Overview", "Entities", "Verification queue", "Moderation", "Search", "Access"]) assert(mod.includes(tab), `tab "${tab}"`);
ok("renderSarahNetwork exported with Overview / Entities / Verification queue / Moderation / Search / Access tabs");

// ── 7. Phase 2.0 acceptance (browser-less) ─────────────────────────────────
const { searchDiscoverCompanies, upsertBusinessDirectoryEntry, clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } = await import(
    "../services/users/businessDirectoryService.js"
);
const { clearSearchConfigForTests } = await import("../services/network/searchConfigService.js");
const { clearPlatformRolesForTests, permissionsForRoles, PLATFORM_PERMISSIONS } = await import("../services/auth/platformRbac.js");

// 7a. anonymous callers are refused on every Phase 2.0 platform route
await withServer(null, async (base) => {
    for (const [method, p] of [
        ["GET", "/api/platform/network/v1/search-config"],
        ["PUT", "/api/platform/network/v1/search-config"],
        ["POST", "/api/platform/network/v1/search-config/reset"],
        ["GET", "/api/platform/network/v1/roles"],
        ["PUT", "/api/platform/network/v1/roles/someone"],
        ["GET", "/api/platform/network/v1/verification/vc_x/evidence/ev_x/download"],
    ]) {
        const res = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
        assert([401, 403].includes(res.status), `${method} ${p} must refuse anonymous callers (got ${res.status})`);
    }
});
ok("Phase 2.0 platform routes (search-config, roles, evidence download) refuse anonymous callers");

// 7b. Search admin round trip + roles, with a platform guard
clearSearchConfigForTests();
clearPlatformRolesForTests();
await withServer(
    (req, _res, next) => {
        req.platformAuth = { via: "superadmin", uid: "smoke-admin" };
        next();
    },
    async (base) => {
        const j = (p, init = {}) => fetch(base + p, { ...init, headers: { "content-type": "application/json" } }).then(async (r) => ({ status: r.status, body: await r.json() }));
        const put = await j("/api/platform/network/v1/search-config", {
            method: "PUT",
            body: JSON.stringify({ categories: [{ id: "smoke", label: "Smoke", keywords: ["smoketest"] }] }),
        });
        assert.equal(put.status, 200, "search-config PUT");
        assert.equal(put.body.data.categories[0].id, "smoke");
        assert.equal((await j("/api/platform/network/v1/search-config", { method: "PUT", body: JSON.stringify({ categories: [] }) })).status, 422);
        assert.equal((await j("/api/platform/network/v1/search-config/reset", { method: "POST" })).status, 200);
        assert.equal((await j("/api/platform/network/v1/roles/smoke-uid", { method: "PUT", body: JSON.stringify({ roles: ["verification_officer"] }) })).status, 200);
        const roles = await j("/api/platform/network/v1/roles");
        assert(roles.body.data.grants.some((g) => g.uid === "smoke-uid"), "role grant listed");
        await j("/api/platform/network/v1/roles/smoke-uid", { method: "PUT", body: JSON.stringify({ roles: [] }) });
    }
);
clearSearchConfigForTests();
clearPlatformRolesForTests();
const officer = permissionsForRoles(["verification_officer"]);
assert(officer.includes(PLATFORM_PERMISSIONS.VERIFICATION_EVIDENCE) && officer.includes(PLATFORM_PERMISSIONS.VERIFICATION_DECIDE), "officer can decide + download");
assert(!officer.includes(PLATFORM_PERMISSIONS.VERIFICATION_RESTRICT) && !officer.includes(PLATFORM_PERMISSIONS.SEARCH_ADMIN), "officer cannot restrict or edit search");
ok("Search admin + roles round trip works; Verification Officer is least-privilege");

// 7c. geo discover through the search service
setBusinessDirectoryStoreForTests(null);
clearBusinessDirectoryForTests();
upsertBusinessDirectoryEntry("geo-emal-1", { discoverability: "public", displayName: "Emalahleni Roasters", industry: "Cafe", location: "Emalahleni", shortDescription: "Coffee." });
upsertBusinessDirectoryEntry("geo-cpt-1", { discoverability: "public", displayName: "Cape Surf Coffee", industry: "Cafe", location: "Cape Town", shortDescription: "Coffee." });
await new Promise((r) => setImmediate(r));
const near = await searchDiscoverCompanies({ near: "Emalahleni", radiusKm: 25 });
assert(near.companies.some((c) => c.displayName === "Emalahleni Roasters" && c.distanceKm === 0), "near finds the local listing");
assert(!near.companies.some((c) => c.displayName === "Cape Surf Coffee"), "near excludes far listings");
assert((await searchDiscoverCompanies({ region: "Western Cape" })).companies.some((c) => c.displayName === "Cape Surf Coffee"), "region filter");
assert((await searchDiscoverCompanies({ city: "Cape Town" })).companies.some((c) => c.displayName === "Cape Surf Coffee"), "city filter");
clearBusinessDirectoryForTests();
ok("geo discover: near + radius, city and region filters work");

// 7d. clients wired
const bridge = read("prototype/sarah-app-ux/js/live-bridge.mjs");
assert(/\/api\/network\/v1\/my-notifications/.test(bridge) && /params\.set\('city', city\)/.test(bridge), "Sarah App bridge: notifications + geo");
assert(/registerPushDevice/.test(bridge), "Sarah App bridge: push token register");
assert(/mcPermSet/.test(mod), "MC sarah-network: platform permission gating");
assert(read("prototype/sarah-app-ux/index.html").includes('id="discoverPlaceInput"'), "Sarah App discover place filter");
assert(read("js/admin/api.js").includes("/search-config") && mod.includes("data-snet-download"), "MC client: search config + evidence download");
ok("Sarah App (geo filter, notification bell) and MC (Search, Access, evidence download) are wired to the Phase 2.0 APIs");

console.log(`\n✅ MC Sarah Network smoke passed (${results.length} checks). Real-browser render is still a manual post-deploy step.`);
