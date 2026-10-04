#!/usr/bin/env node
/**
 * Static + unit checks for Meta WhatsApp Embedded Signup wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const portalJs = read("js/portal/whatsappConnect.js");
assert.match(portalJs, /response_type:\s*['"]code['"]/);
assert.match(portalJs, /override_default_response_type:\s*true/);
assert.match(portalJs, /sessionInfoVersion:\s*['"]3['"]/);
assert.match(portalJs, /config_id:\s*config\.configId/);
assert.match(portalJs, /authResponse\.code/);
assert.match(portalJs, /phone_number_id|waba_id/);
assert.match(portalJs, /eventName === 'FINISH'/);
assert.doesNotMatch(portalJs, /console\.log\s*\(\s*authCode/);
assert.match(portalJs, /completeWhatsAppEmbeddedSignup\(companyId,\s*\{/);
assert.doesNotMatch(portalJs, /META_APP_SECRET\s*=/);
assert.doesNotMatch(portalJs, /client_secret|access_token/i);

const serviceJs = read("services/integrations/metaEmbeddedSignupService.js");
assert.match(serviceJs, /exchangeEmbeddedSignupCode/);
assert.match(serviceJs, /verifyEmbeddedSignupAssets/);
assert.match(serviceJs, /applyEmbeddedSignupIntegration/);
assert.doesNotMatch(serviceJs, /access_token.*res\.json/i);

const hubJs = read("services/integrations/integrationHub.js");
assert.match(hubJs, /embedded-signup/);
assert.match(hubJs, /checkPermission\("canManageIntegrations"\)/);

const graphJs = read("services/integrations/metaEmbeddedSignupGraph.js");
assert.match(graphJs, /oauth\/access_token/);
assert.match(graphJs, /subscribed_apps/);
assert.match(graphJs, /getMetaGraphVersion/);

const graphVer = read("services/integrations/metaGraphVersion.js");
assert.match(graphVer, /v26\.0/);

const waJs = read("services/whatsapp.js");
assert.match(waJs, /getMetaGraphVersion/);
assert.doesNotMatch(waJs, /const GRAPH_API_VERSION = "v21\.0"/);

const webhookJs = read("services/integrations/metaWebhook.js");
assert.match(webhookJs, /verifyMetaWebhookToken/);
assert.match(webhookJs, /validateMetaWebhookSignature/);
assert.match(webhookJs, /META_APP_SECRET/);
assert.match(webhookJs, /VERIFY_TOKEN/);

const { mapEmbeddedSignupError } = await import("../services/integrations/metaEmbeddedSignupMessages.js");
assert.match(
    mapEmbeddedSignupError({ status: 409, message: "already active for another tenant" }),
    /another/i
);

const { getEmbeddedSignupPublicConfig } = await import(
    "../services/integrations/metaEmbeddedSignupService.js"
);
process.env.META_APP_ID = "123";
process.env.WHATSAPP_EMBEDDED_CONFIG_ID = "2689933368070171";
const cfg = getEmbeddedSignupPublicConfig();
assert.equal(cfg.enabled, true);
assert.equal(cfg.configId, "2689933368070171");
assert.equal(cfg.appId, "123");
assert.equal(cfg.platformTokenConfigured, false);

console.log("✓ Meta Embedded Signup client/server wiring verified");
console.log("✓ No secrets referenced in portal embedded signup module");
