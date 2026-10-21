#!/usr/bin/env node
/**
 * F-Sarah G1 — Finance Sarah tool allowlist (schema + executeTool dispatch + context hardening).
 * Local only; no production/staging calls; no mutating tool side effects.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools } from "../services/sarah/tools/index.js";
import {
    getToolsForContext,
    getOpenAIToolDefinitions,
    executeTool,
} from "../services/sarah/toolRegistry.js";
import { canUseTool } from "../services/sarah/permissions.js";
import {
    FINANCE_SARAH_ALLOWED_TOOL_NAMES,
    FINANCE_SARAH_PROHIBITED_TOOL_EXAMPLES,
    FINANCE_SARAH_TOOL_DENIED,
    resolveFinanceSarahActive,
    readSarahPageContextFromRequest,
    resolveSarahToolCatalogueInputs,
    resolveFinanceSarahForChat,
    applyFinanceSarahSessionStickiness,
    SARAH_SESSION_MODULE_SCOPE_FINANCE,
} from "../services/sarah/financeSarahToolPolicy.js";
import { SARAH_PERSONA } from "../services/sarah/sarahPersona.js";
import { buildFinanceSarahPageContext } from "../js/portal/financeSarahContext.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("verify-finance-sarah-tool-policy\n");

initSarahTools();

const financePageContext = {
    page: "finance",
    module: "finance",
    financeWorkspace: "overview",
    financeWorkspaceLabel: "Financial Overview",
};

function makeCtx({ role = "owner", financeSarah = false, pageContext = null, uid = "test-uid" } = {}) {
    const persona = SARAH_PERSONA.CLIENT_OPERATOR;
    return {
        role,
        persona,
        surface: "portal",
        uid,
        companyId: "finance-accept-local",
        financeSarah,
        pageContext,
        canUseTool: (tool) => canUseTool({ role, isSuperAdmin: false }, tool),
    };
}

function catalogueForRequest({ uid = "u1", role = "owner", query = {}, body = {} } = {}) {
    const { financeSarah, pageContext } = resolveSarahToolCatalogueInputs({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid,
        query,
        body,
    });
    const ctx = makeCtx({ role, financeSarah, pageContext, uid });
    return { names: getToolsForContext(ctx).map((t) => t.name), financeSarah, ctx };
}

// --- resolveFinanceSarahActive gates ---
assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: "u1",
        pageContext: financePageContext,
    }),
    true,
    "portal authenticated + finance pageContext"
);

assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: "u1",
        pageContext: { module: "finance", label: "Finance" },
    }),
    false,
    "module without page=finance must not activate"
);

assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: null,
        pageContext: financePageContext,
    }),
    false,
    "unauthenticated uid must not activate"
);

assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.PLATFORM_OPERATOR,
        surface: "mission_control",
        uid: "u1",
        pageContext: financePageContext,
    }),
    false,
    "mission control must not activate Finance Sarah mode"
);

// --- Malformed / spoofed pageContext (restriction only; no privilege grant) ---
assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: "u1",
        pageContext: {
            page: "finance",
            module: "finance",
            role: "owner",
            isSuperAdmin: true,
            financeSarah: false,
            extraTools: ["generateQuote"],
        },
    }),
    true,
    "finance markers activate mode; embedded privilege fields are ignored for activation"
);

const spoofedViewer = makeCtx({
    role: "viewer",
    financeSarah: true,
    pageContext: { ...financePageContext, role: "owner", permissions: { canCreateFinance: true } },
});
const spoofedViewerNames = getToolsForContext(spoofedViewer).map((t) => t.name);
assert.ok(!spoofedViewerNames.includes("generateQuote"), "pageContext cannot elevate viewer to owner tools");
assert.ok(spoofedViewerNames.every((n) => FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(n)));

assert.equal(readSarahPageContextFromRequest({ query: { pageContext: "not-json{" } }), null);
assert.deepEqual(readSarahPageContextFromRequest({ query: { pageContext: "[]" } }), []);
assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: "u1",
        pageContext: [],
    }),
    false,
    "array pageContext must not activate Finance mode"
);

assert.equal(
    resolveFinanceSarahActive({
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal",
        uid: "u1",
        pageContext: null,
    }),
    false,
    "missing pageContext does not activate Finance mode"
);

// Client body.financeSarah boolean must not be read as pageContext
assert.equal(
    readSarahPageContextFromRequest({ body: { financeSarah: true, pageContext: null } }),
    null
);

// --- Schema boundary ---
const globalOwner = makeCtx({ financeSarah: false });
const globalNames = getToolsForContext(globalOwner).map((t) => t.name);
assert.ok(globalNames.includes("generateQuote"), "global owner retains generateQuote");
assert.ok(globalNames.includes("createTask"), "global owner retains createTask in catalogue");
assert.ok(globalNames.length >= 30, "global owner tool catalogue preserved");

const financeOwner = makeCtx({ financeSarah: true, pageContext: financePageContext });
const financeNames = getToolsForContext(financeOwner).map((t) => t.name);
assert.deepEqual(
    new Set(financeNames),
    new Set([...FINANCE_SARAH_ALLOWED_TOOL_NAMES].filter((n) => financeNames.includes(n))),
    "Finance Sarah schema is subset of allowlist only"
);
for (const prohibited of FINANCE_SARAH_PROHIBITED_TOOL_EXAMPLES) {
    assert.ok(!financeNames.includes(prohibited), `schema must exclude ${prohibited}`);
}

const openAiDefs = getOpenAIToolDefinitions(financeOwner);
assert.equal(openAiDefs.length, financeNames.length);
assert.ok(!openAiDefs.some((d) => d.function?.name === "generateQuote"));

// --- Viewer: no elevation via Finance mode ---
const financeViewer = makeCtx({ role: "viewer", financeSarah: true, pageContext: financePageContext });
const viewerFinanceNames = getToolsForContext(financeViewer).map((t) => t.name);
assert.ok(viewerFinanceNames.every((n) => FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(n)));
assert.ok(!viewerFinanceNames.includes("generateQuote"));

// --- Execution boundary (no mutating tool runs) ---
const dispatchCtx = makeCtx({ financeSarah: true, pageContext: financePageContext });
const denied = await executeTool("generateQuote", dispatchCtx, {
    customerName: "Test",
    items: [{ description: "x", amount: 1 }],
});
assert.equal(denied.success, false);
assert.equal(denied.code, FINANCE_SARAH_TOOL_DENIED);

const createTaskDenied = await executeTool("createTask", dispatchCtx, { title: "x" });
assert.equal(createTaskDenied.success, false);
assert.equal(createTaskDenied.code, FINANCE_SARAH_TOOL_DENIED);

const allowedHelp = await executeTool("platformHelp", dispatchCtx, { question: "What is Finance?" });
assert.equal(allowedHelp.success, true, "platformHelp allowed in Finance Sarah");

// Global catalogue still includes createTask; Finance dispatch denies without executing global path
assert.ok(globalNames.includes("createTask"), "global schema unchanged (no createTask execute)");

// --- Catalogue parity (GET /api/sarah/tools uses same getToolsForContext after buildSarahContext) ---
const globalCatalogue = catalogueForRequest({ query: {} });
assert.ok(globalCatalogue.names.includes("generateQuote"), "tools route without pageContext: global catalogue");

const financeCatalogue = catalogueForRequest({
    query: { pageContext: JSON.stringify(financePageContext) },
});
assert.equal(financeCatalogue.financeSarah, true);
assert.deepEqual(
    new Set(financeCatalogue.names),
    new Set(financeNames),
    "tools route with Finance pageContext matches chat schema"
);
assert.ok(!financeCatalogue.names.includes("generateQuote"));

const chatSchema = getOpenAIToolDefinitions(financeOwner).map((d) => d.function.name);
assert.deepEqual(
    [...financeCatalogue.names].sort(),
    [...chatSchema].sort(),
    "OpenAI schema matches tools-route catalogue in Finance mode"
);

// Finance UI / Sarah chat path does not call fetchSarahTools (model tools come from orchestrator at chat time)
const financeSarahUi = readFileSync(join(ROOT, "js/portal/financeSarahPanel.js"), "utf8");
const sarahUi = readFileSync(join(ROOT, "js/portal/sarah/sarah-ui.js"), "utf8");
assert.ok(!financeSarahUi.includes("fetchSarahTools"), "Finance Sarah panel does not fetch tool catalogue");
assert.ok(!sarahUi.includes("fetchSarahTools"), "portal sarah-ui does not fetch tool catalogue");
assert.ok(
    sarahUi.includes("pageContext"),
    "chat sends pageContext; orchestrator builds schema server-side"
);

// buildSarahContext must not accept client financeSarah override (source guard)
const sarahContextSrc = readFileSync(join(ROOT, "services/sarah/sarahContext.js"), "utf8");
assert.ok(
    sarahContextSrc.includes("resolveFinanceSarahActive"),
    "financeSarah derived server-side in buildSarahContext"
);
assert.ok(!sarahContextSrc.includes("overrides.financeSarah"), "no client financeSarah override hook");

// --- Session stickiness: missing pageContext on continued Finance session stays restricted ---
const financeSession = {
    id: "sarah-test-finance-scope",
    context: { sarahModuleScope: SARAH_SESSION_MODULE_SCOPE_FINANCE },
};
const stickyCtx = makeCtx({ financeSarah: false, pageContext: null });
applyFinanceSarahSessionStickiness(stickyCtx, financeSession);
assert.equal(stickyCtx.financeSarah, true, "server session scope enforces Finance Sarah without pageContext");
const stickyNames = getToolsForContext(stickyCtx).map((t) => t.name);
assert.ok(!stickyNames.includes("generateQuote"));

assert.equal(
    resolveFinanceSarahForChat(
        makeCtx({ pageContext: { page: "finance", module: "finance", sarahModuleScope: "finance" } }),
        null
    ),
    true,
    "page markers still activate when session absent"
);

assert.equal(
    resolveFinanceSarahForChat(makeCtx({ pageContext: null }), financeSession),
    true,
    "session scope applies even if pageContext is omitted"
);

assert.equal(
    resolveFinanceSarahForChat(makeCtx({ pageContext: { sarahModuleScope: "finance" } }), null),
    false,
    "client pageContext cannot activate via sarahModuleScope field alone"
);

const orchSrc = readFileSync(join(ROOT, "services/sarah/sarahOrchestrator.js"), "utf8");
assert.ok(orchSrc.includes("applyFinanceSarahSessionStickiness"), "chat handler applies session stickiness");
assert.ok(orchSrc.includes("shouldPersistFinanceSessionScope"), "Finance scope persisted server-side only");

const handleBlock = orchSrc.slice(orchSrc.indexOf("export async function handleSarahChat"));
const stickIdx = handleBlock.indexOf("applyFinanceSarahSessionStickiness(ctx, session)");
const taskIdx = handleBlock.indexOf("const taskIntent = matchTaskIntent(message)");
const toolsIdx = handleBlock.indexOf("const tools = getOpenAIToolDefinitions(ctx)");
assert.ok(stickIdx >= 0 && toolsIdx > stickIdx, "stickiness runs before OpenAI tool schema");
if (taskIdx >= 0) {
    assert.ok(taskIdx > stickIdx, "stickiness runs before task-direct executeTool path");
}

// First Finance turn: Finance UI pageContext restricts tools before session scope is persisted
const uiPageContext = buildFinanceSarahPageContext({ workspace: "sarah", subTab: "" });
assert.equal(uiPageContext.page, "finance");
assert.equal(uiPageContext.module, "finance");

const firstTurnCtx = makeCtx({ financeSarah: false, pageContext: null });
firstTurnCtx.pageContext = uiPageContext;
firstTurnCtx.financeSarah = resolveFinanceSarahActive({
    persona: firstTurnCtx.persona,
    surface: firstTurnCtx.surface,
    uid: firstTurnCtx.uid,
    pageContext: firstTurnCtx.pageContext,
});
const emptySession = { id: "sarah-new", context: {} };
applyFinanceSarahSessionStickiness(firstTurnCtx, emptySession);
assert.equal(firstTurnCtx.financeSarah, true, "first turn: pageContext restricts before session scope exists");
const firstTurnTools = getToolsForContext(firstTurnCtx).map((t) => t.name);
assert.deepEqual(
    [...firstTurnTools].sort(),
    [...FINANCE_SARAH_ALLOWED_TOOL_NAMES].sort(),
    "first turn: F1 allowlist via pageContext before session persist"
);

const panelSrc = readFileSync(join(ROOT, "js/portal/financeSarahPanel.js"), "utf8");
assert.ok(panelSrc.includes("buildFinanceSarahPageContext"), "Finance entry sends pageContext on every chat POST");

console.log("✓ resolveFinanceSarahActive gates (auth, surface, page+module)");
console.log("✓ first Finance turn restricted via pageContext before session persist");
console.log("✓ orchestrator order: stickiness before task-direct and OpenAI tools");
console.log("✓ Finance session stickiness when pageContext omitted on chat");
console.log("✓ malformed/spoofed pageContext cannot grant extra tools");
console.log("✓ Finance Sarah schema default-deny allowlist");
console.log(`✓ Global owner catalogue unchanged (${globalNames.length} tools)`);
console.log("✓ executeTool FINANCE_SARAH_TOOL_DENIED (no mutating tool execution in tests)");
console.log("✓ GET /api/sarah/tools catalogue parity when pageContext query present");
console.log("✓ Finance chat path documented: no fetchSarahTools; execution boundary on chat");
console.log("\nFINANCE_SARAH_TOOL_POLICY_PASS");
