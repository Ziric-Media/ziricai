#!/usr/bin/env node
/**
 * CORPORATE-P0-3C — legacy communication authority boundaries.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getStorageAdapter } from "../services/storage/storageAdapter.js";
import { getOrCreateConversation, saveTenantMessage } from "../services/storage/tenantStorage.js";
import { TenantRepository, resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import {
    saveInboundMessage,
    saveOutboundMessage,
    assertCommunicationCompanyId,
} from "../services/conversationService.js";
import { listTenantConversations } from "../services/tenants/conversationService.js";
import { assertAuthenticatedTenantMemberAccess } from "../services/core/tenantContext.js";
import { ingest } from "../services/integrations/conversationPipeline.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function extractRouteBlock(source, method, path) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route app.${method}("${path}")`);
    const end = source.indexOf("\n});", match.index);
    return source.slice(match.index, end > match.index ? end + 4 : match.index + 800);
}

process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = "strict";

console.log("CORPORATE-P0-3C — canonical authority over legacy communication");

const tenantSvc = read("services/tenants/conversationService.js");
assert.match(
    tenantSvc,
    /conversationRepo\.list[\s\S]*?if \(mappedTenant\.length \|\| !options\.includeLegacy\)/,
    "listTenantConversations must prefer canonical tenant repo"
);
assert.doesNotMatch(
    tenantSvc.slice(tenantSvc.indexOf("listTenantConversations")),
    /legacyListConversations[\s\S]*?if \(legacy\.length\)/,
    "legacy list must not win before tenant repo"
);
console.log("✓ static: canonical list precedence in listTenantConversations");

const convSvc = read("services/conversationService.js");
assert.match(convSvc, /assertCommunicationCompanyId/);
assert.match(convSvc, /saveInboundMessage[\s\S]*assertCommunicationCompanyId/);
assert.match(convSvc, /saveOutboundMessage[\s\S]*assertCommunicationCompanyId/);
console.log("✓ static: production companyId guard on save paths");

const pipeline = read("services/integrations/conversationPipeline.js");
assert.match(pipeline, /NODE_ENV === "production" && !companyId/);
console.log("✓ static: pipeline fail-closed without companyId in production");

const api = read("api/app.js");
const listRoute = extractRouteBlock(api, "get", "/api/conversations");
const msgRoute = extractRouteBlock(api, "get", "/api/conversations/:id/messages");
assert.match(listRoute, /requireTenantScope\(\)/);
assert.doesNotMatch(listRoute, /requireTenantScope\(\{\s*optional:\s*true\s*\}\)/);
assert.match(msgRoute, /getConversation\([^)]*companyId/);
assert.doesNotMatch(msgRoute, /getConversation\(id,\s*50\)\s*;/);
console.log("✓ static: legacy GET routes tenant-scoped + canonical reads");

const mcAdmin = read("admin/js/admin/services/conversations.js");
const mcJs = read("js/admin/services/conversations.js");
for (const [label, src] of [
    ["admin", mcAdmin],
    ["js/admin", mcJs],
]) {
    const getMsgIdx = src.indexOf("export async function getMessages");
    const getMsgBody = src.slice(getMsgIdx, getMsgIdx + 2500);
    assert.match(getMsgBody, /isApiBacked\(dataSource\)/);
    const apiBackedGuard = getMsgBody.match(
        /if \(isApiBacked\(dataSource\)\)[\s\S]*?return \{ items: \[\]/
    );
    assert.ok(apiBackedGuard, `${label} getMessages must short-circuit API-backed empty state`);
    const guardEnd = getMsgBody.indexOf("if (isApiBacked(dataSource))");
    const customersFallback = getMsgBody.indexOf("'customers', conversationId, 'messages'");
    assert.ok(
        guardEnd !== -1 && customersFallback !== -1 && guardEnd < customersFallback,
        `${label} must not reach customers/{id}/messages fallback when API-backed`
    );
}
console.log("✓ static: MC API-backed threads block Firestore message fallbacks");

resetMemoryTenantStore();
const LIST_CO = "p0-3c-list-co";
const LIST_PHONE = "27831112233";
await getOrCreateConversation(LIST_CO, LIST_PHONE, "whatsapp", {
    customerName: "Canonical Tenant",
    lastMessage: "canonical preview",
    preview: "canonical preview",
});
await saveTenantMessage(LIST_CO, LIST_PHONE, "user", "canonical inbound", { source: "customer" });
const legacyStore = await getStorageAdapter();
await legacyStore.upsertCustomer(LIST_PHONE, {
    phone: LIST_PHONE,
    companyId: LIST_CO,
    lastMessage: "legacy-only preview",
    name: "Legacy Row",
});

const listed = await listTenantConversations(LIST_CO, { limit: 20 });
assert.ok(listed.length >= 1, "canonical tenant list must not be empty when tenant conversations exist");
assert.ok(
    listed.some((c) => (c.preview || c.lastMessage || "").includes("canonical")),
    "canonical conversation must appear in list (legacy must not override)"
);

const emptyCanonicalCo = "p0-3c-empty-canonical-co";
const emptyListed = await listTenantConversations(emptyCanonicalCo, { limit: 20 });
assert.equal(emptyListed.length, 0, "empty canonical list must stay empty without includeLegacy");
console.log("✓ runtime: canonical list precedence + empty canonical (no silent legacy)");

process.env.NODE_ENV = "production";
let inboundRejected = false;
try {
    await saveInboundMessage("27830000001", "nope", {});
} catch (err) {
    inboundRejected = err.code === "MISSING_COMPANY_ID";
}
assert.equal(inboundRejected, true, "saveInboundMessage without companyId rejected in production");

let outboundRejected = false;
try {
    await saveOutboundMessage("27830000001", "nope", {});
} catch (err) {
    outboundRejected = err.code === "MISSING_COMPANY_ID";
}
assert.equal(outboundRejected, true, "saveOutboundMessage without companyId rejected in production");

assert.throws(
    () => assertCommunicationCompanyId(null, "test"),
    (err) => err.code === "MISSING_COMPANY_ID"
);

const pipeResult = await ingest({
    companyId: null,
    channel: "whatsapp",
    from: "27830000002",
    to: "x",
    text: "hi",
    externalId: "wamid-p0-3c-no-co",
    metadata: { messageType: "text" },
});
assert.equal(pipeResult.success, false);
assert.equal(pipeResult.error, "MISSING_COMPANY_ID");
process.env.NODE_ENV = "test";
console.log("✓ runtime: production fail-closed on missing companyId (save + pipeline)");

const tenantA = "p0-3c-tenant-a";
const tenantB = "p0-3c-tenant-b";
await assertAuthenticatedTenantMemberAccess(
    {
        companyId: tenantB,
        uid: "user-a",
        isSuperAdmin: false,
        profile: { companyId: tenantA, company: tenantA },
    },
    { getTenantMembership: async () => ({ role: "owner" }) }
).then(
    () => assert.fail("cross-tenant should deny"),
    (err) => assert.equal(err.status, 403)
);
console.log("✓ runtime: cross-tenant member access denied (disposable A/B)");

console.log("\nCORPORATE-P0-3C PASS");
