#!/usr/bin/env node
/**
 * SNET Phase 2.1 — production HTTP smoke (no Playwright).
 * Extends the anonymous checks in SNET_PHASE_2_0.md; documents manual browser steps when auth is required.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.SNET_SMOKE_API || "https://ziricai-production.up.railway.app";
const SARAH = process.env.SNET_SMOKE_SARAH || "https://sarah.ziricai.com";
const APP = process.env.SNET_SMOKE_APP || "https://app.ziricai.com";
const ADMIN = process.env.SNET_SMOKE_ADMIN || "https://admin.ziricai.com";

const checks = [];
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

async function get(url, expect = 200) {
    const res = await fetch(url, { redirect: "follow" });
    checks.push({ url, status: res.status, ok: res.status === expect, type: res.headers.get("content-type") });
    return res;
}

async function main() {
    await get(`${API}/api/health`, 200);
    await get(`${API}/api/discover/companies?city=Pretoria`, 200);
    const badNear = await fetch(`${API}/api/discover/companies?near=Nowhereville`);
    checks.push({ url: "near=Nowhereville", status: badNear.status, ok: badNear.status === 422 });

    const anonNotif = await fetch(`${API}/api/network/v1/my-notifications`);
    checks.push({ url: "my-notifications anon", status: anonNotif.status, ok: anonNotif.status === 401 });

    const anonPush = await fetch(`${API}/api/network/v1/my-push-devices`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    checks.push({
        url: "my-push-devices anon",
        status: anonPush.status,
        ok: anonPush.status === 401 || anonPush.status === 404,
    });

    await get(`${SARAH}/`, 200);
    await get(`${SARAH}/js/live-bridge.mjs`, 200);
    checks.push({ url: "repo sarah push hook", ok: read("prototype/sarah-app-ux/js/app.js").includes("maybeRegisterWebPush") });
    checks.push({ url: "repo live-bridge push", ok: read("prototype/sarah-app-ux/js/live-bridge.mjs").includes("registerPushDevice") });

    await get(`${APP}/`, 200);
    await get(`${ADMIN}/`, 200);
    checks.push({ url: "repo mc officer gating", ok: read("js/admin/modules/sarah-network.js").includes("mcPermSet") });

    const failed = checks.filter((c) => !c.ok);
    console.log("SNET browser smoke (HTTP)");
    for (const c of checks) console.log(c.ok ? "✓" : "✗", c.url, c.status ?? "", c.type ?? "");
    console.log("\nManual (auth required):");
    console.log("  • MC: sign in as verification_officer → lands on Sarah Network → Verification queue; no Suspend/Restrict without role.");
    console.log("  • Sarah App: enable notifications permission → token POST /api/network/v1/my-push-devices; bell still polls.");
    console.log("  • Portal: publish listing with city only → Discover near= finds business after gazetteer inference.");

    if (failed.length) {
        console.error(`\n${failed.length} check(s) failed`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
