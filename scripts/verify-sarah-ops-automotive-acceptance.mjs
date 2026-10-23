#!/usr/bin/env node
/**
 * Sarah Ops Automotive follow-up — prompt wiring, company unwrap, reply semantics (model-independent).
 * Local only; no production calls.
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";
process.env.INDUSTRY_PRESET_RUNTIME = "1";

const { resolveSarahTenantCompanyRecord } = await import("../services/sarah/sarahContext.js");
const { resolveIndustryPresetForTenant } = await import("../services/platform/industryPresetContext.js");
const {
    buildOperationsAutomotiveSystemPromptExtra,
    buildSarahSystemPrompt,
} = await import("../services/sarah/prompts/systemPrompt.js");
const { isTaskOverdue, summarizeTaskForSarah } = await import("../services/sarah/tools/taskToolCommon.js");
const { PORTAL_SARAH_SURFACES } = await import("../services/sarah/portalSarahSurfaces.js");
const { SARAH_PERSONA } = await import("../services/sarah/sarahPersona.js");

console.log("verify-sarah-ops-automotive-acceptance\n");

const AUTOMOTIVE_CO = {
    id: "central-motors-rtb",
    name: "Central Motors",
    industryPresetId: "automotive-dealership",
    industryPresetVersion: "1.0.0",
    industryPresetActivatedAt: "2026-10-23T12:00:00.000Z",
    industry: "automotive",
};

const GENERIC_CO = { id: "generic-co", name: "Generic Co" };

// --- Company record resolution ---
const fromWorkspace = resolveSarahTenantCompanyRecord(
    { company: { ...AUTOMOTIVE_CO, name: "From workspace" } },
    { company: { id: "wrapped", name: "Should not win" } },
    "x"
);
assert.equal(fromWorkspace.name, "From workspace");

const fromWrapper = resolveSarahTenantCompanyRecord(null, { company: AUTOMOTIVE_CO }, "x");
assert.equal(fromWrapper.industryPresetId, "automotive-dealership");

const presetFromWrapper = await resolveIndustryPresetForTenant(fromWrapper);
assert.equal(presetFromWrapper.active, true);

const fallback = resolveSarahTenantCompanyRecord(null, null, "fallback-id");
assert.equal(fallback.id, "fallback-id");

console.log("✓ resolveSarahTenantCompanyRecord (workspace, wrapper, fallback)");

// --- Prompt: automotive operations ---
const autoPreset = await resolveIndustryPresetForTenant(AUTOMOTIVE_CO);
const autoCtx = {
    role: "owner",
    companyId: AUTOMOTIVE_CO.id,
    companyName: AUTOMOTIVE_CO.name,
    surface: PORTAL_SARAH_SURFACES.OPERATIONS,
    persona: SARAH_PERSONA.CLIENT_OPERATOR,
    pageContext: { module: "operations", page: "operations" },
    industryPreset: autoPreset,
};

const opsExtra = buildOperationsAutomotiveSystemPromptExtra(autoCtx);
assert.match(opsExtra, /dealership/i);
assert.match(opsExtra, /listTasks/i);
assert.match(opsExtra, /inventory/i);
assert.match(opsExtra, /appointment calendar/i);
assert.match(opsExtra, /Empty listTasks/i);

const fullPrompt = buildSarahSystemPrompt(autoCtx);
assert.match(fullPrompt, /Automotive dealership \(mandatory/);

const genericCtx = {
    ...autoCtx,
    industryPreset: { active: false, reason: "none" },
};
assert.equal(buildOperationsAutomotiveSystemPromptExtra(genericCtx), "");
assert.doesNotMatch(buildSarahSystemPrompt(genericCtx), /Automotive dealership \(mandatory/);

const financeCtx = {
    ...autoCtx,
    surface: PORTAL_SARAH_SURFACES.FINANCE,
    pageContext: { module: "finance", page: "finance" },
    financeSarah: true,
};
assert.equal(buildOperationsAutomotiveSystemPromptExtra(financeCtx), "");

console.log("✓ Operations Automotive system prompt (tenant gating)");

// --- Task / overdue rules (authoritative) ---
const now = Date.parse("2026-10-24T10:00:00.000Z");
assert.equal(isTaskOverdue({ status: "open", dueAt: "2026-10-23T00:00:00.000Z" }, now), true);
assert.equal(isTaskOverdue({ status: "done", dueAt: "2026-10-23T00:00:00.000Z" }, now), false);
assert.equal(isTaskOverdue({ status: "open", dueAt: null }, now), false);
const sum = summarizeTaskForSarah(
    { id: "1", title: "Prep", status: "open", dueAt: "2026-10-23T00:00:00.000Z" },
    { nowMs: now }
);
assert.equal(sum.overdue, true);

console.log("✓ Overdue classification (open/done/missing dueAt)");

/**
 * Model-independent reply checklist for acceptance reviews (fixture strings).
 * @param {string} reply
 * @param {{ count?: number, overdueCount?: number }} listTasksData
 */
export function automotiveOpsReplySemanticsChecklist(reply, listTasksData = {}) {
    const text = String(reply || "");
    const lower = text.toLowerCase();
    const count = Number(listTasksData.count ?? 0);
    const overdueCount = Number(listTasksData.overdueCount ?? 0);

    return {
        statesZeroTasksWhenEmpty:
            count === 0
                ? /no overdue|zero|none|0 overdue|no matching|no recorded|no tasks/i.test(text)
                : true,
        dealershipAware: /dealership|vehicle preparation|test-drive|delivery milestone/i.test(text),
        capabilityLimits:
            /inventory|appointment|calendar|command centre|not available|cannot|can't|this chat/i.test(lower),
        groundedInToolCounts:
            overdueCount === 0 ? !/\b(several|many|multiple) overdue\b/i.test(lower) : true,
        noCrmWonAsDelivery: !/crm.*won.*delivered/i.test(lower),
    };
}

const goodEmptyReply = `There are currently no recorded dealership tasks in Central Motors Operations, so I found no overdue tasks. I can help coordinate vehicle preparation, test-drive follow-ups and delivery milestones using existing tasks. I can't directly inspect live vehicle inventory or the appointment calendar from this chat.`;

const goodChecks = automotiveOpsReplySemanticsChecklist(goodEmptyReply, { count: 0, overdueCount: 0 });
assert.ok(Object.values(goodChecks).every(Boolean), JSON.stringify(goodChecks));

const badReply = "You have several overdue tasks. I checked inventory and booked a test drive.";
const badChecks = automotiveOpsReplySemanticsChecklist(badReply, { count: 0, overdueCount: 0 });
assert.equal(badChecks.groundedInToolCounts, false);

console.log("✓ Reply semantics checklist (fixture-based, model-independent)");

console.log("\nverify-sarah-ops-automotive-acceptance: PASS");
