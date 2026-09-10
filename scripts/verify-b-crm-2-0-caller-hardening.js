#!/usr/bin/env node
/**
 * B-CRM-2-0 — Caller hardening static verification (Gate 1).
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(root, relPath), "utf8");
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function sha256(relPath) {
    const buf = readFileSync(join(root, relPath));
    return createHash("sha256").update(buf).digest("hex");
}

function assertMirrorPair(a, b) {
    assert(existsSync(join(root, a)), `Missing ${a}`);
    assert(existsSync(join(root, b)), `Missing ${b}`);
    const ha = sha256(a);
    const hb = sha256(b);
    assert(ha === hb, `Mirror mismatch: ${a} <> ${b}`);
}

const FORBIDDEN_TOUCH = [
    "services/core/tenantContext.js",
    "services/queue/workers/messageWorker.js",
    "services/integrations/crmSyncService.js",
];

function testPortalDataServiceUsesApiRequest() {
    const src = read("app/js/portal/core/dataService.js");
    assert(src.includes("import { apiRequest }"), "dataService must import apiRequest");
    assert(!/await fetch\(path/.test(src), "dataService must not use raw fetch(path");
    console.log("✓ Portal dataService uses authenticated apiRequest");
}

function testPortalTakeoverUsesApiClient() {
    const mod = read("app/js/portal/modules/conversations.js");
    const api = read("app/js/portal/api.js");
    assert(mod.includes("setConversationTakeover"), "conversations.js must use setConversationTakeover");
    assert(!mod.includes("fetch(`/api/companies/"), "conversations.js must not raw-fetch takeover");
    assert(api.includes("setConversationTakeover"), "portal/api.js must export setConversationTakeover");
    console.log("✓ Portal takeover uses authenticated API client");
}

function testPortalSarahAuth() {
    const ui = read("app/js/portal/sarah/sarah-ui.js");
    const chat = read("app/js/portal/sarah/sarah-chat.js");
    assert(!ui.includes("accessToken"), "sarah-ui must not use accessToken");
    assert(ui.includes("sarahChat"), "sarah-ui must use sarahChat from api.js");
    assert(chat.includes("apiRequest"), "sarah-chat must delegate to apiRequest");
    console.log("✓ Portal Sarah uses Firebase-backed apiRequest");
}

function testAdminCanonicalCrmPaths() {
    const api = read("admin/js/admin/api.js");
    assert(!api.includes('`/api/customers'), "admin api must not call legacy /api/customers");
    assert(!api.includes('`/api/conversations'), "admin api must not call legacy /api/conversations");
    assert(api.includes("/crm/customers"), "admin api must use canonical CRM customers path");
    assert(api.includes("/companies/${encodeURIComponent(companyId)}/conversations"), "admin api must use canonical conversations path");
    console.log("✓ Admin CRM helpers target canonical tenant-scoped routes");
}

function testAdminServiceCompanyIdThreading() {
    const customers = read("admin/js/admin/services/customers.js");
    const conversations = read("admin/js/admin/services/conversations.js");
    assert(customers.includes("getCustomerProfile(companyId, phoneOrId)"), "customers service threads companyId on profile");
    assert(customers.includes("patchCustomer(companyId, phone, body)"), "customers service threads companyId on patch");
    assert(conversations.includes("getMessages(companyId, conversationId)"), "conversations service threads companyId on messages");
    assert(conversations.includes("apiRes.data?.messages || apiRes.data?.items"), "conversations service adapts canonical message shape");

    const detail = read("admin/js/admin/modules/customers-detail.js");
    const inbox = read("admin/js/admin/modules/conversations.js");
    assert(detail.includes("getCustomerProfile(companyId, phone)"), "customers-detail passes companyId to profile");
    assert(detail.includes("patchCustomer(companyId, phone"), "customers-detail passes companyId to patch");
    assert(inbox.includes("getMessages(companyId,"), "conversations module passes companyId to getMessages");
    console.log("✓ Admin modules/services thread companyId through detail/patch/message calls");
}

function testCanonicalPatchParity() {
    const routes = read("services/api/customerOpsRoutes.js");
    assert(routes.includes("deleteNote"), "customerOpsRoutes must handle deleteNoteId via deleteNote");
    assert(routes.includes("updateTask"), "customerOpsRoutes must handle updateTask");
    assert(routes.includes('../customerService.js'), "PATCH parity must use tenant-scoped customerService");
    assert(!routes.includes("assignedEmployee"), "PATCH parity must not add assignedEmployee");
    console.log("✓ Canonical PATCH supports deleteNoteId + updateTask via customerService");
}

function testMirrors() {
    const pairs = [
        ["app/js/portal/core/dataService.js", "js/portal/core/dataService.js"],
        ["app/js/portal/api.js", "js/portal/api.js"],
        ["app/js/portal/modules/conversations.js", "js/portal/modules/conversations.js"],
        ["app/js/portal/sarah/sarah-chat.js", "js/portal/sarah/sarah-chat.js"],
        ["app/js/portal/sarah/sarah-ui.js", "js/portal/sarah/sarah-ui.js"],
        ["admin/js/admin/api.js", "js/admin/api.js"],
        ["admin/js/admin/services/customers.js", "js/admin/services/customers.js"],
        ["admin/js/admin/services/conversations.js", "js/admin/services/conversations.js"],
        ["admin/js/admin/modules/customers-detail.js", "js/admin/modules/customers-detail.js"],
        ["admin/js/admin/modules/conversations.js", "js/admin/modules/conversations.js"],
    ];
    for (const [a, b] of pairs) assertMirrorPair(a, b);
    console.log(`✓ ${pairs.length} mirror pairs byte-identical (SHA256)`);
}

function testForbiddenUntouched() {
    for (const rel of FORBIDDEN_TOUCH) {
        const src = read(rel);
        assert(!src.includes("B-CRM-2-0"), `${rel} must not contain gate marker edits`);
    }
    const tenant = read("services/core/tenantContext.js");
    assert(!tenant.includes('ENFORCEMENT = "strict"'), "tenantContext must not flip strict mode");
    console.log("✓ Forbidden server files unchanged (spot check)");
}

function main() {
    testPortalDataServiceUsesApiRequest();
    testPortalTakeoverUsesApiClient();
    testPortalSarahAuth();
    testAdminCanonicalCrmPaths();
    testAdminServiceCompanyIdThreading();
    testCanonicalPatchParity();
    testMirrors();
    testForbiddenUntouched();
    console.log("\nB-CRM-2-0 static verification passed.");
}

main();
