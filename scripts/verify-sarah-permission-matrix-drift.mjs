#!/usr/bin/env node
/**
 * Sarah server permission matrix — drift guard.
 * Every registered tool requiredPermissions key must exist in services/sarah/permissions.js
 * (same role semantics as js/portal/permissions.js for mirrored keys).
 *
 * Intentional exceptions: permissionless tools (empty requiredPermissions); superadmin-only
 * tools gated in canUseTool via SUPERADMIN_ONLY / platformOnly, not via matrix keys.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools } from "../services/sarah/tools/index.js";
import { listAllTools } from "../services/sarah/toolRegistry.js";
import { PERMISSION_MATRIX } from "../services/sarah/permissions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Keys used by Sarah tools but not mirrored on the server matrix yet (must stay empty). */
const DOCUMENTED_MATRIX_EXCEPTIONS = new Set([]);

/** Matrix keys that must match js/portal/permissions.js role arrays exactly (Sarah may differ on legacy keys). */
const PORTAL_ROLE_PARITY_KEYS = new Set(["canViewFinance", "canCreateFinance", "canManageIntegrations"]);

console.log("verify-sarah-permission-matrix-drift\n");

initSarahTools();

const portalSrc = readFileSync(join(ROOT, "js/portal/permissions.js"), "utf8");

/** @type {Map<string, string[]>} */
const portalRoleMappings = new Map();
const portalMatrixRe = /^\s{2}(can[A-Z][A-Za-z]+):\s*\[([^\]]+)\],?\s*$/gm;
let m;
while ((m = portalMatrixRe.exec(portalSrc)) !== null) {
    const key = m[1];
    const roles = m[2]
        .split(",")
        .map((s) => s.replace(/['"]/g, "").trim())
        .filter(Boolean);
    portalRoleMappings.set(key, roles);
}

const missingFromMatrix = [];
const roleMismatches = [];

for (const tool of listAllTools()) {
    const perms = tool.requiredPermissions || [];
    if (!perms.length) continue;
    for (const key of perms) {
        if (DOCUMENTED_MATRIX_EXCEPTIONS.has(key)) continue;
        if (!(key in PERMISSION_MATRIX)) {
            missingFromMatrix.push({ tool: tool.name, permission: key });
            continue;
        }
        if (!PORTAL_ROLE_PARITY_KEYS.has(key)) continue;
        const portalRoles = portalRoleMappings.get(key);
        if (!portalRoles) continue;
        const sarahRoles = [...PERMISSION_MATRIX[key]].sort();
        const expected = [...portalRoles].sort();
        if (JSON.stringify(sarahRoles) !== JSON.stringify(expected)) {
            roleMismatches.push({
                permission: key,
                sarah: sarahRoles,
                portal: expected,
                exampleTool: tool.name,
            });
        }
    }
}

if (missingFromMatrix.length) {
    const byKey = new Map();
    for (const { tool, permission } of missingFromMatrix) {
        if (!byKey.has(permission)) byKey.set(permission, []);
        byKey.get(permission).push(tool);
    }
    console.error("Missing permission keys in services/sarah/permissions.js PERMISSION_MATRIX:");
    for (const [key, tools] of [...byKey.entries()].sort()) {
        console.error(`  ${key}: ${tools.sort().join(", ")}`);
    }
    assert.fail("Sarah tool requiredPermissions reference undefined matrix keys");
}

const seenMismatch = new Set();
for (const row of roleMismatches) {
    if (seenMismatch.has(row.permission)) continue;
    seenMismatch.add(row.permission);
    console.error(
        `Role mismatch for ${row.permission} (example tool ${row.exampleTool}): Sarah [${row.sarah.join(", ")}] vs portal [${row.portal.join(", ")}]`
    );
}
assert.equal(seenMismatch.size, 0, "Sarah matrix role lists must match js/portal/permissions.js for shared keys");

const matrixKeys = Object.keys(PERMISSION_MATRIX).sort();
console.log(`✓ ${listAllTools().length} tools scanned`);
console.log(`✓ ${matrixKeys.length} matrix keys; no undefined requiredPermissions`);
console.log("✓ Shared keys match portal role mappings");
console.log("\nverify-sarah-permission-matrix-drift: PASS");
