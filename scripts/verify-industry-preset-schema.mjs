#!/usr/bin/env node
/**
 * Industry Preset Library Phase 1 — schema, registry, validator, Sarah tool parity.
 */
import assert from "node:assert/strict";
import { initSarahTools } from "../services/sarah/tools/index.js";
import { getToolsForContext } from "../services/sarah/toolRegistry.js";
import { canUseTool } from "../services/sarah/permissions.js";
import { SARAH_PERSONA } from "../services/sarah/sarahPersona.js";
import {
    getIndustryPresetDocument,
    listIndustryPresetCatalogue,
} from "../services/platform/industryPresetRegistry.js";
import { validateIndustryPreset } from "../services/platform/industryPresetValidator.js";
import {
    industryPresetTurnSystemAddendum,
    resolveIndustryPresetForTenant,
} from "../services/platform/industryPresetContext.js";
import {
    previewIndustryPresetActivation,
    activateIndustryPresetForCompany,
    deactivateIndustryPresetForCompany,
} from "../services/platform/industryPresetActivationService.js";
import { createCompany, getCompany } from "../services/tenants/companyService.js";

console.log("verify-industry-preset-schema\n");

const catalogue = listIndustryPresetCatalogue();
assert.ok(catalogue.some((e) => e.presetId === "construction-engineering"), "construction preset catalogue entry");

const construction = getIndustryPresetDocument("construction-engineering", "1.0.0");
assert.ok(construction, "construction preset document loads");

const validation = validateIndustryPreset(construction);
if (!validation.valid) {
    console.error(validation.errors);
}
assert.equal(validation.valid, true, "construction preset validates");

const invalid = {
    presetId: "bad",
    name: "Bad",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    description: "x",
    industry: "x",
    jurisdictions: ["global"],
    status: "draft",
    owner: "test",
    lastReviewedAt: "2026-10-22",
    sarahMapping: {
        finance: { purpose: "p", capabilities: ["not.a.real.cap"], instructionBlockIds: [] },
        operations: { purpose: "p", capabilities: [], instructionBlockIds: [] },
        hr: { purpose: "p", capabilities: [], instructionBlockIds: [] },
        admin: { purpose: "p", capabilities: [], instructionBlockIds: [] },
    },
    toolAllowlist: ["createTask"],
};
const invalidResult = validateIndustryPreset(invalid);
assert.equal(invalidResult.valid, false);
assert.ok(
    invalidResult.errors.some((e) => e.rule === "FORBIDDEN_TOOL_GRANT_FIELD"),
    "toolAllowlist rejected"
);
assert.ok(
    invalidResult.errors.some((e) => e.rule === "UNKNOWN_CAPABILITY"),
    "unknown capability rejected"
);

process.env.INDUSTRY_PRESET_RUNTIME = "1";
const resolved = await resolveIndustryPresetForTenant({
    industryPresetId: "construction-engineering",
    industryPresetVersion: "1.0.0",
    industryPresetActivatedAt: "2026-10-22T12:00:00.000Z",
});
assert.equal(resolved.active, true, "resolved preset active when pinned and approved");

const testCo = `preset-act-${Date.now()}`;
await createCompany(testCo, { name: "Preset Activation Test Co", industry: "construction", country: "ZA" });
const preview = await previewIndustryPresetActivation(testCo, "construction-engineering", "1.0.0", {});
assert.equal(preview.ok, true, "activation preview ok");
const activated = await activateIndustryPresetForCompany(
    testCo,
    { presetId: "construction-engineering", version: "1.0.0" },
    {}
);
assert.equal(activated.ok, true, "activation succeeds");
const stored = await getCompany(testCo);
assert.equal(stored.industryPresetId, "construction-engineering");
const deactivated = await deactivateIndustryPresetForCompany(testCo);
assert.equal(deactivated.ok, true);

const financeCtx = {
    industryPreset: resolved,
    surface: "portal-finance",
    pageContext: { module: "finance" },
    financeSarah: true,
};
const addendum = industryPresetTurnSystemAddendum(financeCtx);
assert.ok(addendum.includes("INDUSTRY PRESET"), "finance addendum present");
assert.ok(addendum.includes("retention"), "finance terminology block included");

initSarahTools();
const financePageContext = { page: "sarah", module: "finance", label: "Sarah Finance" };
function financeToolNames() {
    const ctx = {
        role: "owner",
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal-finance",
        uid: "preset-verify",
        companyId: "preset-verify-co",
        financeSarah: true,
        pageContext: financePageContext,
        industryPreset: resolved,
        canUseTool: (tool) => canUseTool({ role: "owner", isSuperAdmin: false }, tool),
    };
    return getToolsForContext(ctx).map((t) => t.name).sort();
}

function financeToolNamesBaseline() {
    const ctx = {
        role: "owner",
        persona: SARAH_PERSONA.CLIENT_OPERATOR,
        surface: "portal-finance",
        uid: "preset-verify",
        companyId: "preset-verify-co",
        financeSarah: true,
        pageContext: financePageContext,
        canUseTool: (tool) => canUseTool({ role: "owner", isSuperAdmin: false }, tool),
    };
    return getToolsForContext(ctx).map((t) => t.name).sort();
}

assert.deepEqual(financeToolNames(), financeToolNamesBaseline(), "Finance Sarah tool list unchanged with preset ctx");

console.log("OK — industry preset schema and activation checks passed.");
