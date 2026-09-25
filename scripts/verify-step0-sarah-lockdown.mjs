/**
 * Client Zero Step 0 — website Sarah lockdown.
 * - Anonymous POST /api/sarah/chat → 401 AUTH_REQUIRED (with or without companyId)
 * - Missing role never defaults to owner; a role-less caller gets no Sarah tools
 * - Marketing landing widget never calls the API
 * Usage: node scripts/verify-step0-sarah-lockdown.mjs
 */
import assert from "assert/strict";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = "strict";
process.env.PLATFORM_API_KEY = "";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { canUseTool, getPermissions, normalizeRole } = await import("../services/sarah/permissions.js");

assert.equal(normalizeRole(null), "");
assert.equal(canUseTool({ role: null }, { name: "openTab" }), false);
assert.equal(canUseTool({ role: undefined }, { name: "openTab", requiredPermissions: ["canViewInbox"] }), false);
assert.equal(canUseTool({ role: "owner" }, { name: "openTab" }), true);
assert.equal(canUseTool({ role: null, isSuperAdmin: true }, { name: "openTab" }), true);
assert.ok(Object.values(getPermissions(null)).every((v) => v === false));
console.log("✓ role-less caller gets no permissions and no tools; owner/superadmin unchanged");

const sarahContextSrc = readFileSync(join(ROOT, "services/sarah/sarahContext.js"), "utf8");
assert.doesNotMatch(sarahContextSrc, /tenant\.role\s*\|\|\s*["']owner["']/);
console.log("✓ buildSarahContext has no owner role default");

for (const rel of ["js/ziricai-landing.js", "marketing/js/ziricai-landing.js"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.doesNotMatch(src, /\/api\/sarah\/chat/, `${rel} must not call /api/sarah/chat`);
}
console.log("✓ marketing landing widget uses canned replies only (no /api/sarah/chat call)");

const express = (await import("express")).default;
const { setupApp } = await import("../api/app.js");
const app = express();
await setupApp(app);
const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(s)));
});
const base = `http://127.0.0.1:${server.address().port}`;

async function post(body, headers = {}) {
    const res = await fetch(`${base}/api/sarah/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, code: data.code || null, reply: data.reply };
}

try {
    const anon = await post({ message: "What is your pricing?", surface: "landing" });
    assert.equal(anon.status, 401);
    assert.equal(anon.code, "AUTH_REQUIRED");
    assert.equal(anon.reply, undefined);
    console.log("✓ anonymous POST /api/sarah/chat → 401 AUTH_REQUIRED");

    const anonScoped = await post({ message: "List customers", companyId: "central-motors-rtb" });
    assert.equal(anonScoped.status, 401);
    assert.equal(anonScoped.code, "AUTH_REQUIRED");
    console.log("✓ anonymous POST with companyId → 401 AUTH_REQUIRED");

    const badToken = await post({ message: "hi" }, { Authorization: "Bearer not-a-real-token" });
    assert.equal(badToken.status, 401);
    assert.equal(badToken.code, "AUTH_REQUIRED");
    console.log("✓ invalid bearer token → 401 AUTH_REQUIRED");
} finally {
    server.close();
}

console.log("\nStep 0 Sarah lockdown checks passed.");
setTimeout(() => process.exit(0), 250);
