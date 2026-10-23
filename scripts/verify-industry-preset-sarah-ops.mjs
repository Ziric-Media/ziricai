#!/usr/bin/env node
/**
 * Automotive industry preset + Sarah Operations — local verification only.
 * No production/staging calls.
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";
process.env.INDUSTRY_PRESET_RUNTIME = "1";

const { initSarahTools } = await import("../services/sarah/tools/index.js");
const { getToolsForContext, executeTool } = await import("../services/sarah/toolRegistry.js");
const { canUseTool } = await import("../services/sarah/permissions.js");
const { SARAH_PERSONA } = await import("../services/sarah/sarahPersona.js");
const { PORTAL_SARAH_SURFACES } = await import("../services/sarah/portalSarahSurfaces.js");
const {
    industryPresetTurnSystemAddendum,
    buildIndustryPresetWorkspaceHint,
    resolveIndustryPresetForTenant,
} = await import("../services/platform/industryPresetContext.js");
const { isTaskOverdue, summarizeTaskForSarah } = await import("../services/sarah/tools/taskToolCommon.js");
const { createTaskForAccess } = await import("../services/tenants/taskService.js");

console.log("verify-industry-preset-sarah-ops\n");

initSarahTools();

const AUTOMOTIVE_COMPANY = {
    id: "automotive-ops-test-co",
    name: "Test Motors",
    industryPresetId: "automotive-dealership",
    industryPresetVersion: "1.0.0",
    industryPresetActivatedAt: "2026-10-23T12:00:00.000Z",
};

const GENERIC_COMPANY = {
    id: "generic-ops-test-co",
    name: "Generic Co",
};

function makeCtx({
    role = "owner",
    companyId = AUTOMOTIVE_COMPANY.id,
    industryPreset = null,
    surface = PORTAL_SARAH_SURFACES.OPERATIONS,
} = {}) {
    return {
        role,
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface,
        uid: role === "viewer" ? "viewer-uid-1" : "owner-uid-1",
        companyId,
        industryPreset,
        pageContext: { module: "operations", page: "operations" },
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: false }, tool),
    };
}

const resolvedAuto = await resolveIndustryPresetForTenant(AUTOMOTIVE_COMPANY);
assert.equal(resolvedAuto.active, true);
assert.equal(resolvedAuto.presetId, "automotive-dealership");

const resolvedGeneric = await resolveIndustryPresetForTenant(GENERIC_COMPANY);
assert.equal(resolvedGeneric.active, false);

const autoCtx = makeCtx({ industryPreset: resolvedAuto });
const addendumAuto = industryPresetTurnSystemAddendum(autoCtx);
assert.match(addendumAuto, /INDUSTRY PRESET/);
assert.match(addendumAuto, /listTasks/i);
assert.match(addendumAuto, /listTasks and createTask only/i);

const genericCtx = makeCtx({ companyId: GENERIC_COMPANY.id, industryPreset: resolvedGeneric });
assert.equal(industryPresetTurnSystemAddendum(genericCtx), "");

const workspaceHint = buildIndustryPresetWorkspaceHint(autoCtx);
assert.match(workspaceHint, /automotive-dealership/);

const ownerTools = getToolsForContext(makeCtx({ role: "owner" }));
assert.ok(ownerTools.some((t) => t.name === "listTasks"));
assert.ok(ownerTools.some((t) => t.name === "createTask"));

const viewerTools = getToolsForContext(makeCtx({ role: "viewer" }));
assert.ok(viewerTools.some((t) => t.name === "listTasks"));
assert.ok(!viewerTools.some((t) => t.name === "createTask"));

const viewerCreate = await executeTool("createTask", makeCtx({ role: "viewer" }), {
    title: "Should fail",
});
assert.equal(viewerCreate.success, false);
assert.equal(viewerCreate.code, "PERMISSION_DENIED");

const fixedNow = Date.parse("2026-10-23T15:00:00.000Z");
assert.equal(isTaskOverdue({ status: "open", dueAt: "2026-10-22T10:00:00.000Z" }, fixedNow), true);
assert.equal(isTaskOverdue({ status: "done", dueAt: "2026-10-22T10:00:00.000Z" }, fixedNow), false);
assert.equal(isTaskOverdue({ status: "open", dueAt: null }, fixedNow), false);

const summary = summarizeTaskForSarah(
    { id: "t1", title: "Prep", status: "open", dueAt: "2026-10-22T10:00:00.000Z" },
    { nowMs: fixedNow }
);
assert.equal(summary.overdue, true);

const COMPANY_A = "ops-preset-iso-a";
const COMPANY_B = "ops-preset-iso-b";
const MGR = { role: "manager", uid: "mgr-iso" };

await createTaskForAccess(COMPANY_A, MGR, { title: "Task A only" });
await createTaskForAccess(COMPANY_B, MGR, { title: "Task B only" });

const listA = await executeTool(
    "listTasks",
    makeCtx({ companyId: COMPANY_A, industryPreset: resolvedAuto }),
    { limit: 50 }
);
assert.equal(listA.success, true);
assert.ok(listA.data.tasks.every((t) => t.title !== "Task B only"));
assert.ok(listA.data.tasks.some((t) => t.title === "Task A only"));

const financeCtx = makeCtx({
    surface: PORTAL_SARAH_SURFACES.FINANCE,
    industryPreset: resolvedAuto,
});
financeCtx.financeSarah = true;
financeCtx.pageContext = { module: "finance", page: "finance" };
const financeTools = getToolsForContext(financeCtx);
assert.ok(!financeTools.some((t) => t.name === "createTask"));

console.log("verify-industry-preset-sarah-ops: PASS");
