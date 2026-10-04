#!/usr/bin/env node
/**
 * Read-only: compare live Netlify + Railway vs local Embedded Signup wiring.
 * No secrets, no writes, no deploys.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = (process.env.EMBED_PARITY_API_BASE || "https://ziricai-production.up.railway.app").replace(
    /\/$/,
    ""
);
const APP_ORIGIN = (process.env.EMBED_PARITY_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const LOCAL_MARKERS = [
    { file: "js/portal/whatsappConnect.js", patterns: [/override_default_response_type:\s*true/, /sessionInfoVersion:\s*['"]3['"]/, /response_type:\s*['"]code['"]/] },
    { file: "services/integrations/integrationHub.js", patterns: [/embedded-signup-config/, /embedded-signup/] },
    { file: "services/integrations/metaEmbeddedSignupService.js", patterns: [/getEmbeddedSignupPublicConfig/, /completeEmbeddedSignupForTenant/] },
    { file: "services/integrations/metaGraphVersion.js", patterns: [/v26\.0/] },
];

function sha256File(rel) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function localMarkerCheck() {
    const out = {};
    for (const { file, patterns } of LOCAL_MARKERS) {
        const full = path.join(ROOT, file);
        out[file] = { exists: fs.existsSync(full), markers: {} };
        if (!fs.existsSync(full)) continue;
        const text = fs.readFileSync(full, "utf8");
        for (const re of patterns) {
            out[file].markers[re.source] = re.test(text);
        }
        out[file].sha256 = sha256File(file);
        out[file].bytes = fs.statSync(full).size;
    }
    return out;
}

async function fetchText(url) {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    return { status: res.status, text, bytes: Buffer.byteLength(text, "utf8") };
}

async function probeApiRoute(method, route) {
    const res = await fetch(`${API_BASE}${route}`, { method, headers: { Accept: "application/json" } });
    const text = await res.text();
    const isHtml404 = /Cannot GET|Cannot POST|<!DOCTYPE html>/i.test(text);
    return {
        status: res.status,
        routeMissing: res.status === 404 && isHtml404,
        bodyPreview: text.slice(0, 120).replace(/\s+/g, " "),
    };
}

const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    appOrigin: APP_ORIGIN,
    local: localMarkerCheck(),
    live: {},
    verdict: {},
};

const prodWa = await fetchText(`${APP_ORIGIN}/js/portal/whatsappConnect.js`);
report.live.whatsappConnectJs = {
    status: prodWa.status,
    bytes: prodWa.bytes,
    sha256: crypto.createHash("sha256").update(prodWa.text).digest("hex"),
    markers: {
        override_default_response_type: /override_default_response_type:\s*true/.test(prodWa.text),
        sessionInfoVersion3: /sessionInfoVersion:\s*['"]3['"]/.test(prodWa.text),
        responseTypeCode: /response_type:\s*['"]code['"]/.test(prodWa.text),
        graphDefaultV26: /graphVersion \|\| 'v26\.0'/.test(prodWa.text),
        graphDefaultV21: /graphVersion \|\| 'v21\.0'/.test(prodWa.text),
    },
};

const prodApiJs = await fetchText(`${APP_ORIGIN}/js/portal/api.js`);
report.live.portalApiJs = {
    status: prodApiJs.status,
    hasEmbeddedConfigClient: /embedded-signup-config/.test(prodApiJs.text),
    hasEmbeddedCompleteClient: /embedded-signup/.test(prodApiJs.text),
};

report.live.apiRoutes = {
    health: await probeApiRoute("GET", "/api/public/health"),
    embeddedSignupConfig: await probeApiRoute("GET", "/api/integrations/whatsapp/embedded-signup-config"),
    embeddedSignupPost: await probeApiRoute("POST", "/api/companies/disposable-embed-test/integrations/whatsapp/embedded-signup"),
};

const localWa = report.local["js/portal/whatsappConnect.js"];
const netlifyHasEmbedUi =
    report.live.whatsappConnectJs.status === 200 && report.live.whatsappConnectJs.markers.override_default_response_type;
const netlifyMatchesLatestLocal =
    localWa?.sha256 && report.live.whatsappConnectJs.sha256 === localWa.sha256;
const railwayHasEmbedApi = !report.live.apiRoutes.embeddedSignupConfig.routeMissing;

report.verdict = {
    netlify_embedded_signup_ui_partial_or_full: netlifyHasEmbedUi,
    netlify_matches_latest_local_whatsappConnect: netlifyMatchesLatestLocal,
    railway_embedded_signup_api_deployed: railwayHasEmbedApi,
    e2e_connect_whatsapp_ready: netlifyHasEmbedUi && railwayHasEmbedApi && netlifyMatchesLatestLocal,
    notes: [],
};

if (netlifyHasEmbedUi && !netlifyMatchesLatestLocal) {
    report.verdict.notes.push(
        "Netlify serves whatsappConnect.js with Embedded Signup markers but hash differs from local (e.g. Graph SDK default v21 vs v26)."
    );
}
if (netlifyHasEmbedUi && !railwayHasEmbedApi) {
    report.verdict.notes.push(
        "Portal UI will call GET /api/integrations/whatsapp/embedded-signup-config; production Railway returns 404 (route not deployed)."
    );
}
if (!report.local["services/integrations/integrationHub.js"]?.markers?.["embedded-signup-config"]) {
    report.verdict.notes.push("Local integrationHub missing embedded-signup-config (unexpected).");
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict.e2e_connect_whatsapp_ready ? 0 : 1);
