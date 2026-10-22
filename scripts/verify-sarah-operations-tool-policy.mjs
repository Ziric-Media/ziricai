#!/usr/bin/env node
/**
 * Sarah Ops tool allowlist — schema + executeTool dispatch (local, no side effects beyond memory if used).
 */
import assert from "node:assert/strict";
import { initSarahTools } from "../services/sarah/tools/index.js";
import { getToolsForContext, executeTool } from "../services/sarah/toolRegistry.js";
import { canUseTool } from "../services/sarah/permissions.js";
import {
    OPERATIONS_SARAH_ALLOWED_TOOL_NAMES,
    OPERATIONS_SARAH_PROHIBITED_TOOL_EXAMPLES,
    OPERATIONS_SARAH_TOOL_DENIED,
    resolveOperationsSarahActive,
    applyOperationsSarahSessionStickiness,
} from "../services/sarah/operationsSarahToolPolicy.js";
import { SARAH_PERSONA } from "../services/sarah/sarahPersona.js";

console.log("verify-sarah-operations-tool-policy\n");
initSarahTools();

const opsPageContext = { page: "operations", module: "operations", section: "tasks" };

function makeCtx({ role = "owner", operationsSarah = false } = {}) {
    return {
        role,
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal-operations",
        uid: "ops-policy-uid",
        companyId: "ops-policy-co",
        operationsSarah,
        pageContext: operationsSarah ? opsPageContext : null,
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: false }, tool),
    };
}

assert.equal(
    resolveOperationsSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal-operations",
        uid: "u1",
        pageContext: opsPageContext,
    }),
    true
);

const ownerOps = makeCtx({ operationsSarah: true });
const names = getToolsForContext(ownerOps).map((t) => t.name);
for (const allowed of OPERATIONS_SARAH_ALLOWED_TOOL_NAMES) {
    assert.ok(names.includes(allowed), `missing allowlisted ${allowed}`);
}
for (const denied of OPERATIONS_SARAH_PROHIBITED_TOOL_EXAMPLES) {
    assert.ok(!names.includes(denied), `prohibited ${denied} must not appear`);
}

const denied = await executeTool("generateQuote", ownerOps, {});
assert.equal(denied.code, OPERATIONS_SARAH_TOOL_DENIED);

const globalOwner = makeCtx({ operationsSarah: false });
const globalNames = getToolsForContext(globalOwner).map((t) => t.name);
assert.ok(globalNames.includes("generateQuote"), "non-ops Sarah keeps global tools");

console.log("✓ operationsSarah allowlist on portal-operations");
console.log("✓ executeTool OPERATIONS_SARAH_TOOL_DENIED");
console.log("\nSARAH_OPERATIONS_TOOL_POLICY_PASS");
