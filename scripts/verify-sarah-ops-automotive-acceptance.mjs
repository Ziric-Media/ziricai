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
const {
    industryPresetTurnSystemAddendum,
    partitionPresetCapabilitiesForSarahAddendum,
} = await import("../services/platform/industryPresetContext.js");
const { isTaskOverdue, summarizeTaskForSarah } = await import("../services/sarah/tools/taskToolCommon.js");
const { PORTAL_SARAH_SURFACES } = await import("../services/sarah/portalSarahSurfaces.js");
const { SARAH_PERSONA } = await import("../services/sarah/sarahPersona.js");
const {
    automotiveOpsReplySemanticsChecklist,
    enhanceAutomotiveOpsStatusReply,
    getListTasksOutcome,
    isAutomotiveOpsBroadStatusQuestion,
    operationsTaskToolUiHints,
    AUTOMOTIVE_OPS_LIMITATION_PARAGRAPH,
} = await import("../services/sarah/automotiveOpsStatusReply.js");

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

const STATUS_QUESTION =
    "What Operations tasks are overdue or still open at Central Motors? Please summarise the current position and tell me what needs attention next.";

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

// --- Full assembled prompt (orchestrator parity) ---
const fullAddendum = industryPresetTurnSystemAddendum(autoCtx);
const assembledPrompt = buildSarahSystemPrompt(autoCtx) + fullAddendum;
assert.doesNotMatch(
    assembledPrompt,
    /Operational capabilities for this module include:/i,
    "legacy misleading capability line must not appear"
);
assert.doesNotMatch(
    assembledPrompt,
    /Operational capabilities for this module include:[\s\S]*vehicle inventory/i,
    "inventory must not be listed as Sarah-operational"
);
assert.match(fullAddendum, /not exposed as Sarah tools in this chat/i);
assert.match(fullAddendum, /vehicle inventory/i);
assert.match(fullAddendum, /automotive dashboard metrics/i);
assert.match(fullAddendum, /Sarah tools for this module align with: List operational tasks/i);

const partitioned = partitionPresetCapabilitiesForSarahAddendum(
    autoPreset.preset.sarahMapping.operations.capabilities
);
assert.ok(partitioned.sarahToolBackedLabels.includes("List operational tasks"));
assert.ok(partitioned.portalOnlyLabels.some((l) => /vehicle inventory/i.test(l)));
assert.ok(partitioned.portalOnlyLabels.some((l) => /dashboard metrics/i.test(l)));

const financeAddendum = industryPresetTurnSystemAddendum(financeCtx);
assert.doesNotMatch(financeAddendum, /Automotive dealership \(mandatory/i);
assert.doesNotMatch(financeAddendum, /vehicle inventory \(canonical stock\)/i);
assert.match(financeAddendum, /Dealership invoicing/i);
assert.doesNotMatch(
    financeAddendum,
    /not exposed as Sarah tools in this chat:.*Read invoices/i,
    "unclassified finance capabilities must not be implied portal-only"
);

console.log("✓ Full prompt assembly (preset addendum capability honesty)");

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

const listTasksActions = [
    {
        success: true,
        tool: "listTasks",
        data: { count: 0, overdueCount: 0, tasks: [] },
    },
];

assert.ok(isAutomotiveOpsBroadStatusQuestion(STATUS_QUESTION));

const enhanced = enhanceAutomotiveOpsStatusReply({
    reply: productionWeakReply,
    ctx: autoCtx,
    message: STATUS_QUESTION,
    actions: listTasksActions,
});
assert.equal(enhanced.modified, true);
assert.equal(enhanced.limitationAppended, true);
const enhancedChecks = automotiveOpsReplySemanticsChecklist(enhanced.reply, {
    count: 0,
    overdueCount: 0,
    statusQuestion: true,
});
assert.equal(enhancedChecks.capabilityDisclosureWhenStatusAsked, true);
assert.equal(enhancedChecks.noFabricatedPendingWork, true);
assert.equal(
    (enhanced.reply.match(/Important limitation:/g) || []).length,
    1,
    "limitation paragraph must not duplicate"
);
assert.ok(enhanced.reply.includes(AUTOMOTIVE_OPS_LIMITATION_PARAGRAPH));

const enhancedTwice = enhanceAutomotiveOpsStatusReply({
    reply: enhanced.reply,
    ctx: autoCtx,
    message: STATUS_QUESTION,
    actions: listTasksActions,
});
assert.equal(enhancedTwice.limitationAppended, false, "existing disclosure must not duplicate");

const unrelatedMessage = "How do I create a task in Operations? Walk me through the title field.";
assert.equal(isAutomotiveOpsBroadStatusQuestion(unrelatedMessage), false);
const unrelatedEnhance = enhanceAutomotiveOpsStatusReply({
    reply: "Use createTask after you describe the work.",
    ctx: autoCtx,
    message: unrelatedMessage,
    actions: listTasksActions,
});
assert.equal(unrelatedEnhance.modified, false);

const financeEnhance = enhanceAutomotiveOpsStatusReply({
    reply: productionWeakReply,
    ctx: financeCtx,
    message: STATUS_QUESTION,
    actions: listTasksActions,
});
assert.equal(financeEnhance.modified, false);

const noListTasks = enhanceAutomotiveOpsStatusReply({
    reply: productionWeakReply,
    ctx: autoCtx,
    message: STATUS_QUESTION,
    actions: [],
});
assert.equal(noListTasks.modified, false);

const outcome = getListTasksOutcome(listTasksActions);
assert.equal(outcome.called, true);
assert.equal(outcome.count, 0);

assert.deepEqual(operationsTaskToolUiHints({ surface: PORTAL_SARAH_SURFACES.OPERATIONS }), []);
assert.deepEqual(operationsTaskToolUiHints({ surface: PORTAL_SARAH_SURFACES.ADMIN }), [
    { navigate: "operations" },
]);

console.log("✓ Reply enhancement (disclosure, gating, navigation hints)");

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
