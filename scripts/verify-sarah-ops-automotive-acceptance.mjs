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
assert.match(opsExtra, /task list only/i);
assert.match(opsExtra, /Do \*\*not\*\* imply the dealership has no operational issues overall/i);
assert.match(opsExtra, /when relevant only/i);

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

/** Model-independent reply checklist for acceptance reviews (fixture strings). */
const TASK_LIST_SCOPE_RE =
    /task list|task data|operations task list|recorded in.*task|available task data|based on.*task/i;

/** Broad reassurance not tied to explicit Operations task-list scope (production gap). */
const BROAD_REASSURANCE_RE =
    /need your attention at this time|nothing needs (your )?attention|no operational issues overall|dealership has no issues|everything is fine at central motors/i;

/**
 * @param {string} reply
 * @param {{ count?: number, overdueCount?: number, statusQuestion?: boolean }} listTasksData
 */
export function automotiveOpsReplySemanticsChecklist(reply, listTasksData = {}) {
    const text = String(reply || "");
    const lower = text.toLowerCase();
    const count = Number(listTasksData.count ?? 0);
    const overdueCount = Number(listTasksData.overdueCount ?? 0);
    const statusQuestion = listTasksData.statusQuestion !== false;

    return {
        statesZeroTasksWhenEmpty:
            count === 0
                ? /no overdue|zero|none|0 overdue|no matching|no recorded|no open|no tasks/i.test(text)
                : true,
        scopedToTaskEvidence:
            count === 0 && statusQuestion ? TASK_LIST_SCOPE_RE.test(lower) : true,
        avoidsUnscopedAllClear:
            count === 0 && statusQuestion
                ? !(BROAD_REASSURANCE_RE.test(lower) && !TASK_LIST_SCOPE_RE.test(lower))
                : true,
        dealershipAware: /dealership|vehicle preparation|test-drive|delivery milestone|central motors/i.test(text),
        capabilityDisclosureWhenStatusAsked:
            count === 0 && statusQuestion
                ? /inventory|appointment|calendar|command centre/i.test(lower) &&
                  /task list only|only the task|only.*task list|haven't verified|have not verified|not verified|did not check|can't confirm|cannot confirm|this conversation|this chat|available tools/i.test(
                      lower
                  )
                : true,
        noFalseToolClaims:
            !/\b(checked|verified|reviewed|confirmed)\b.*\b(inventory|appointment calendar|command centre)\b/i.test(
                lower
            ) || /not verified|haven't|have not|can't|cannot|didn't|did not/i.test(lower),
        groundedInToolCounts:
            overdueCount === 0 ? !/\b(several|many|multiple) overdue\b/i.test(lower) : true,
        noCrmWonAsDelivery: !/crm.*won.*delivered/i.test(lower),
        noFabricatedPendingWork:
            !/\b(pending prep|awaiting delivery|test drive scheduled|vehicle is ready)\b/i.test(lower),
    };
}

const proposedAcceptanceReply = `There are currently no open or overdue tasks recorded in Central Motors' Operations task list. Based on the available task data, there are no outstanding tasks requiring attention.

For the dealership, the next useful step is to ensure vehicle preparation, test-drive coordination and delivery milestones are being recorded as Operations tasks where applicable.

Important limitation: I checked the Operations task list only. I haven't verified live vehicle inventory, the appointment calendar or the Automotive Command Centre metrics in this conversation, so I can't confirm their current status.

Would you like help creating an Operations task?`;

const proposedChecks = automotiveOpsReplySemanticsChecklist(proposedAcceptanceReply, {
    count: 0,
    overdueCount: 0,
    statusQuestion: true,
});
assert.ok(Object.values(proposedChecks).every(Boolean), JSON.stringify(proposedChecks, null, 2));

const goodEmptyReply = proposedAcceptanceReply;
const goodChecks = automotiveOpsReplySemanticsChecklist(goodEmptyReply, {
    count: 0,
    overdueCount: 0,
    statusQuestion: true,
});
assert.ok(Object.values(goodChecks).every(Boolean), JSON.stringify(goodChecks));

const productionWeakReply = `There are currently **zero matching tasks** in Operations at Central Motors. This means there are no overdue or open tasks that need your attention at this time.

If there's anything specific you would like to address or create a new task for, please let me know!

Do you want me to take you to operations now?`;

const weakChecks = automotiveOpsReplySemanticsChecklist(productionWeakReply, {
    count: 0,
    overdueCount: 0,
    statusQuestion: true,
});
assert.equal(weakChecks.capabilityDisclosureWhenStatusAsked, false, "production-like gap: missing capability disclosure");
assert.equal(weakChecks.scopedToTaskEvidence, false, "production-like gap: task-list scope not explicit");
assert.equal(
    weakChecks.avoidsUnscopedAllClear,
    false,
    "production-like gap: broad reassurance without task-list scope"
);

const badReply = "You have several overdue tasks. I checked inventory and booked a test drive.";
const badChecks = automotiveOpsReplySemanticsChecklist(badReply, { count: 0, overdueCount: 0, statusQuestion: true });
assert.equal(badChecks.groundedInToolCounts, false);
assert.equal(badChecks.noFalseToolClaims, false);

const unrelatedOpsReply =
    "To create a task in Operations, describe the work and I can use createTask after you confirm the title.";
const unrelatedChecks = automotiveOpsReplySemanticsChecklist(unrelatedOpsReply, {
    count: 0,
    overdueCount: 0,
    statusQuestion: false,
});
assert.ok(unrelatedChecks.capabilityDisclosureWhenStatusAsked, "unrelated answers should not require status disclosure");

console.log("✓ Reply semantics checklist (empty-task scope, disclosure, fixtures)");

console.log("\nverify-sarah-ops-automotive-acceptance: PASS");
