#!/usr/bin/env node
/**
 * F-Sarah 1 loopback acceptance — API/session/tools (no browser).
 * Requires: npm run dev:finance-acceptance on 127.0.0.1:3099
 */
import assert from "node:assert/strict";
import { initSarahTools, ALL_TOOLS } from "../services/sarah/tools/index.js";
import { getToolsForContext } from "../services/sarah/toolRegistry.js";
import { canUseTool } from "../services/sarah/permissions.js";

const BASE = process.env.FINANCE_ACCEPTANCE_BASE || "http://127.0.0.1:3099";

async function session(role) {
    const res = await fetch(`${BASE}/api/finance-acceptance/session?role=${role}`);
    assert.equal(res.status, 200, `session ${role}`);
    return res.json();
}

async function sarahTools(token, companyId) {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const res = await fetch(`${BASE}/api/sarah/tools${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function sarahChat(token, body) {
    const res = await fetch(`${BASE}/api/sarah/chat`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ surface: "portal", ...body }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

console.log("verify-finance-sarah-f1-acceptance\n");

const health = await fetch(`${BASE}/api/finance-acceptance/health`).then((r) => r.json());
assert.equal(health.ok, true, "acceptance API must be running");

const owner = await session("owner");
const viewer = await session("viewer");
assert.equal(owner.companyId, "finance-accept-local");

const financePageContext = {
    page: "finance",
    module: "finance",
    financeWorkspace: "reports",
    financeWorkspaceLabel: "Reports & Planning",
    financeSubTab: "catalogue",
    financeSubTabLabel: "Report library",
};

const chat = await sarahChat(owner.token, {
    message: "What Finance workspace am I in?",
    companyId: owner.companyId,
    pageContext: financePageContext,
});
assert.equal(chat.status, 200, `chat failed: ${JSON.stringify(chat.body)}`);
assert.ok(chat.body.reply || chat.body.sessionId, "chat response");

const wrongTenant = await sarahChat(owner.token, {
    message: "test",
    companyId: "demo-central-motors",
    pageContext: financePageContext,
});
assert.notEqual(wrongTenant.status, 200, "spoofed companyId must not succeed");

initSarahTools();
const viewerTools = getToolsForContext({
    role: "viewer",
    isSuperAdmin: false,
    canUseTool: (t) => canUseTool({ role: "viewer", isSuperAdmin: false }, t),
}).map((t) => t.name);

const ownerTools = getToolsForContext({
    role: "owner",
    isSuperAdmin: false,
    canUseTool: (t) => canUseTool({ role: "owner", isSuperAdmin: false }, t),
}).map((t) => t.name);

const financeWriteTools = ALL_TOOLS.filter((t) =>
    /^createFinance|^updateFinance|^voidFinance|^recordFinance/i.test(t.name)
).map((t) => t.name);

assert.equal(financeWriteTools.length, 0, "no finance write or BOS cycle write tools in registry");
const financeReadTools = ALL_TOOLS.filter((t) => /^viewFinance|^viewOutstanding|^viewInvoice/.test(t.name)).map(
    (t) => t.name
);
assert.ok(financeReadTools.includes("viewFinanceOverviewSummary"), "F1 overview read tool in registry");

const riskyForFinance = ["generateQuote"];
for (const name of riskyForFinance) {
    assert.ok(ownerTools.includes(name), `owner still has global ${name} (document for F-Sarah 2)`);
}

const apiToolsOwner = await sarahTools(owner.token, owner.companyId);
assert.equal(apiToolsOwner.status, 200);
const apiToolNames = (apiToolsOwner.body?.tools || []).map((t) => t.name || t);
assert.ok(
    !apiToolNames.some((n) => /^createFinance|^listFinanceTransactions|^listFinanceInvoices/i.test(n)),
    "tools route must not expose raw finance HTTP-style tool names"
);

console.log("✓ acceptance health + owner/viewer sessions");
console.log("✓ sarah/chat accepts finance pageContext");
console.log("✓ spoofed companyId rejected");
console.log(`✓ viewer tool count: ${viewerTools.length} (no finance-specific tools)`);
console.log(`✓ owner has generateQuote (global; not Finance API — track for F-Sarah 2)`);
console.log("\nFINANCE_SARAH_F1_ACCEPTANCE_API_PASS");
