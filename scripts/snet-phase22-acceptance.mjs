#!/usr/bin/env node
/**
 * SNET Phase 2.2 acceptance — repo wiring + production HTTP checks (extends snet-browser-smoke).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.SNET_SMOKE_API || "https://ziricai-production.up.railway.app";
const SARAH = process.env.SNET_SMOKE_SARAH || "https://sarah.ziricai.com";
const ADMIN = process.env.SNET_SMOKE_ADMIN || "https://admin.ziricai.com";

const checks = [];
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

async function get(url, expect = 200) {
    const res = await fetch(url, { redirect: "follow" });
    checks.push({ url, status: res.status, ok: res.status === expect });
    return res;
}

async function main() {
    await get(`${API}/api/health`, 200);
    const sessionAnon = await fetch(`${API}/api/auth/session`);
    checks.push({ url: "session anon", status: sessionAnon.status, ok: sessionAnon.status === 401 });

    await get(`${SARAH}/`, 200);
    checks.push({ url: "repo FCM module", ok: read("prototype/sarah-app-ux/js/push-fcm.mjs").includes("obtainFcmWebToken") });
    checks.push({ url: "repo geocoder", ok: read("services/network/nominatimGeocode.js").includes("nominatim.openstreetmap.org") });
    checks.push({ url: "repo phase22 doc", ok: read("docs/architecture/SNET_PHASE_2_2.md").includes("2.2.1") });

    await get(`${ADMIN}/`, 200);
    checks.push({ url: "repo mc officer host", ok: /isMissionControlHost[\s\S]*netlify/i.test(read("js/auth.js")) });

    const failed = checks.filter((c) => !c.ok);
    console.log("SNET Phase 2.2 acceptance");
    for (const c of checks) console.log(c.ok ? "✓" : "✗", c.url, c.status ?? "");
    console.log("\nManual:");
    console.log("  • Set firebase.vapidKey in site config + FCM_SERVER_KEY on Railway for live device push.");
    console.log("  • Publish a listing with an unknown town → Discover ?near=lat,lng returns the card.");
  console.log("  • MC: verification_officer Firebase user (no superadmin doc) → Verification queue landing.");

    if (failed.length) {
        console.error(`\n${failed.length} check(s) failed`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
