#!/usr/bin/env node
/**
 * Production-safe WHATSAPP_TOKEN check — never prints token or secrets.
 * Usage (Railway env): railway run node scripts/debug-whatsapp-token-safe.mjs
 * Usage (local .env):  node scripts/debug-whatsapp-token-safe.mjs
 */
import "dotenv/config";

const appId = String(process.env.META_APP_ID || process.env.FB_APP_ID || "").trim();
const appSecret = String(process.env.META_APP_SECRET || process.env.APP_SECRET || "").trim();
const inputToken = String(process.env.WHATSAPP_TOKEN || "").trim();
const version = String(process.env.META_GRAPH_VERSION || "v26.0").trim();
// Central Motors pilot ID (seedDemoTenants); override via env when set on Railway.
const CM_SEED_PHONE_NUMBER_ID = "1209265748933699";
const phoneNumberId = String(
    process.env.PHONE_NUMBER_ID ||
        process.env.CENTRAL_MOTORS_WHATSAPP_PHONE_NUMBER_ID ||
        CM_SEED_PHONE_NUMBER_ID
).trim();

function fail(msg) {
    console.error(`[debug-whatsapp-token] ${msg}`);
    process.exit(1);
}

if (!appId) fail("META_APP_ID is not set");
if (!appSecret) fail("META_APP_SECRET is not set (required for debug_token app access token)");
if (!inputToken) fail("WHATSAPP_TOKEN is not set");

const appAccessToken = `${appId}|${appSecret}`;
const debugUrl =
    `https://graph.facebook.com/${version}/debug_token?` +
    `input_token=${encodeURIComponent(inputToken)}&` +
    `access_token=${encodeURIComponent(appAccessToken)}`;

const debugRes = await fetch(debugUrl);
const debugJson = await debugJsonSafe(debugRes);

if (debugJson.error) {
    console.log("debug_token:");
    console.log("  is_valid: false");
    console.log("  app_id: —");
    console.log("  type: —");
    console.log("  app_id_matches_META_APP_ID: false");
    console.log("  error:", debugJson.error.message || debugJson.error.code || "unknown");
    process.exit(1);
}

const d = debugJson.data || {};
const reportedAppId = d.app_id != null ? String(d.app_id) : "—";
const matches = reportedAppId !== "—" && reportedAppId === appId;

console.log("debug_token:");
console.log("  is_valid:", Boolean(d.is_valid));
console.log("  app_id:", reportedAppId);
console.log("  type:", d.type || "—");
console.log("  app_id_matches_META_APP_ID:", matches);

if (!phoneNumberId) {
    console.log("phone_number_access:");
    console.log("  phone_number_id: — (no PHONE_NUMBER_ID / CENTRAL_MOTORS_WHATSAPP_PHONE_NUMBER_ID)");
    console.log("  can_read: false");
    process.exit(matches && d.is_valid ? 0 : 1);
}

const phoneUrl =
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}` +
    `?fields=id,display_phone_number,verified_name`;
const phoneRes = await fetch(phoneUrl, {
    headers: { Authorization: `Bearer ${inputToken}` },
});
const phoneJson = await debugJsonSafe(phoneRes);

console.log("phone_number_access:");
console.log("  phone_number_id:", maskId(phoneNumberId));
console.log("  can_read:", phoneRes.ok && !phoneJson.error);
if (phoneRes.ok && phoneJson.display_phone_number) {
    console.log("  display_phone_number:", phoneJson.display_phone_number);
    console.log("  verified_name:", phoneJson.verified_name || "—");
} else if (phoneJson.error) {
    console.log("  graph_error:", phoneJson.error.message || phoneJson.error.code);
}

process.exit(matches && d.is_valid && phoneRes.ok ? 0 : 1);

async function debugJsonSafe(res) {
    try {
        return await res.json();
    } catch {
        return { error: { message: `Non-JSON response HTTP ${res.status}` } };
    }
}

function maskId(id) {
    const s = String(id);
    if (s.length <= 4) return "****";
    return `***${s.slice(-4)}`;
}
