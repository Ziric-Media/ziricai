#!/usr/bin/env node
/**
 * B-MC-5c-2e-1 — Integration read authorization (channels + logs).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertIntegrationReadAccess } from "../services/core/tenantContext.js";
import { hasPlatformApiKeyAccess } from "../services/auth/platformAuth.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

function extractRouteBlock(source, method, path) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${path}")`);
    return source.slice(match.index, match.index + 600);
}

async function expectAccess(fn, message) {
    try {
        await fn();
        assert.fail(message || "Expected access check to throw");
    } catch (err) {
        return err;
    }
}

console.log("verify-integration-read-authorization");

const INTEGRATION_HUB = read("services/integrations/integrationHub.js");
const APP_JS = read("api/app.js");
const PORTAL_API = read("js/portal/api.js");
const APP_PORTAL_API = read("app/js/portal/api.js");
const API_REQUEST = read("js/shared/apiRequest.js");

const channelsBlock = extractRouteBlock(INTEGRATION_HUB, "get", "/api/integrations/channels/:companyId");
const logsBlock = extractRouteBlock(INTEGRATION_HUB, "get", "/api/integrations/logs/:companyId");

assert.match(channelsBlock, /requireTenantOrPlatformAccess\(\)/);
assert.match(logsBlock, /requireTenantOrPlatformAccess\(\)/);
assert.doesNotMatch(channelsBlock, /requireTenantScope\(\{\s*optional:\s*true\s*\}\)/);
assert.doesNotMatch(logsBlock, /requireTenantScope\(\{\s*optional:\s*true\s*\}\)/);

console.log("✓ channels and logs routes use requireTenantOrPlatformAccess()");

const platformGetBlock = extractRouteBlock(
    APP_JS,
    "get",
    "/api/platform/companies/:companyId/integrations/whatsapp"
);
assert.match(platformGetBlock, /requirePlatformAccess\(\)/);
assert.doesNotMatch(platformGetBlock, /requireTenantOrPlatformAccess/);

console.log("✓ Mission Control platform integration GET still uses requirePlatformAccess()");

assert.match(PORTAL_API, /fetchIntegrationChannels/);
assert.match(PORTAL_API, /fetchIntegrationLogs/);
assert.match(PORTAL_API, /from '\.\.\/shared\/apiRequest\.js'/);
assert.match(APP_PORTAL_API, /fetchIntegrationChannels/);
assert.match(APP_PORTAL_API, /fetchIntegrationLogs/);
assert.match(API_REQUEST, /ensureAuthReadyForApi/);
assert.match(API_REQUEST, /Authorization = `Bearer \$\{token\}`/);

console.log("✓ Portal integration callers attach Firebase Bearer token via apiRequest");

assert.match(read("services/tenants/integrationService.js"), /sanitizeIntegrationRecord/);
assert.match(read("services/sarah/sarahContext.js"), /getWhatsAppIntegration/);

const webhookGetBlock = extractRouteBlock(INTEGRATION_HUB, "get", "/webhooks/:channel");
assert.doesNotMatch(webhookGetBlock, /requireTenantOrPlatformAccess/);

console.log("✓ Sanitization preserved; Sarah internal lookup unchanged; webhook routes untouched");

const prevKey = process.env.PLATFORM_API_KEY;
process.env.PLATFORM_API_KEY = "test-platform-key-e2e1";

const req = { headers: { "x-platform-api-key": "test-platform-key-e2e1" } };
assert.equal(hasPlatformApiKeyAccess(req), true);

const superCtx = {
    companyId: "tenant-b",
    uid: "super-1",
    isSuperAdmin: true,
    profile: { role: "superadmin", companyId: "other" },
};
assert.deepEqual(await assertIntegrationReadAccess(superCtx, { headers: {} }), { via: "superadmin" });

const unauthErr = await expectAccess(() =>
    assertIntegrationReadAccess(
        { companyId: "tenant-a", uid: null, isSuperAdmin: false, profile: null },
        { headers: {} }
    )
);
assert.equal(unauthErr.status, 401);
assert.equal(unauthErr.code, "UNAUTHORIZED");

const crossErr = await expectAccess(() =>
    assertIntegrationReadAccess(
        {
            companyId: "tenant-b",
            uid: "user-a",
            isSuperAdmin: false,
            profile: { companyId: "tenant-a", role: "owner" },
        },
        {}
    )
);
assert.equal(crossErr.status, 403);
assert.equal(crossErr.code, "TENANT_FORBIDDEN");
assert.equal(crossErr.message, "Access denied");

const apiKeyAccess = await assertIntegrationReadAccess(
    { companyId: "central-motors-rtb", uid: null, isSuperAdmin: false, profile: null },
    req
);
assert.equal(apiKeyAccess.via, "api_key");

if (prevKey === undefined) {
    delete process.env.PLATFORM_API_KEY;
} else {
    process.env.PLATFORM_API_KEY = prevKey;
}

console.log("✓ unauthenticated → 401");
console.log("✓ cross-tenant profile → 403 (generic message)");
console.log("✓ superadmin → allowed");
console.log("✓ platform API key → allowed");

const tenantContextSource = read("services/core/tenantContext.js");
const integrationBlock = tenantContextSource.slice(
    tenantContextSource.indexOf("export async function assertIntegrationReadAccess")
);
assert.match(integrationBlock, /if \(!ctx\.profile\) \{[\s\S]*resolveMembership\(ctx\.uid, ctx\.companyId\)/);
console.log("✓ missing profile may fall back to tenant membership for integration reads");

console.log("\nAll B-MC-5c-2e-1 integration read authorization checks passed.");
