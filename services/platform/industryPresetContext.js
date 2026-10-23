/**
 * Runtime industry preset resolution for Sarah — instruction hints only; no tool policy changes.
 */
import { getIndustryPresetDocument, isPresetStatusActivatable, loadInstructionBlock } from "./industryPresetRegistry.js";
import { summariseCapabilityGaps, validateIndustryPreset } from "./industryPresetValidator.js";
import { getPlatformCapability } from "./industryPresetCapabilities.js";
import { moduleKeyFromPortalSurface } from "../sarah/portalSarahSurfaces.js";

const MODULE_TO_SARAH_KEY = {
    finance: "finance",
    operations: "operations",
    hr: "hr",
    admin: "admin",
};

/**
 * Whether preset hints may be applied for this company record.
 * @param {object} [company]
 */
export function isIndustryPresetRuntimeEnabled(company) {
    if (process.env.INDUSTRY_PRESET_RUNTIME === "0") return false;
    if (!company?.industryPresetId) return false;
    if (process.env.INDUSTRY_PRESET_RUNTIME === "1") return true;
    return Boolean(company.industryPresetActivatedAt);
}

/**
 * @param {object} [company]
 */
export async function resolveIndustryPresetForTenant(company) {
    if (!isIndustryPresetRuntimeEnabled(company)) {
        return { active: false, reason: "runtime_disabled_or_unconfigured" };
    }

    const presetId = String(company.industryPresetId || "").trim();
    const version = String(company.industryPresetVersion || "").trim() || undefined;
    const preset = getIndustryPresetDocument(presetId, version);
    if (!preset) {
        return { active: false, reason: "preset_not_found", presetId, version: version || null };
    }

    const allowValidated = process.env.INDUSTRY_PRESET_RUNTIME === "allow-validated";
    if (!isPresetStatusActivatable(preset.status, { allowValidated })) {
        return {
            active: false,
            reason: "preset_not_activatable",
            presetId: preset.presetId,
            version: preset.version,
            status: preset.status,
        };
    }

    const validation = validateIndustryPreset(preset);
    if (!validation.valid) {
        return {
            active: false,
            reason: "preset_invalid",
            presetId: preset.presetId,
            version: preset.version,
            errors: validation.errors,
        };
    }

    return {
        active: true,
        presetId: preset.presetId,
        version: preset.version,
        name: preset.name,
        industry: preset.industry,
        status: preset.status,
        preset,
    };
}

function resolveSarahModuleKey(ctx) {
    const surface = String(ctx.surface || "").toLowerCase();
    return ctx.pageContext?.module || moduleKeyFromPortalSurface(surface);
}

function mappingForContext(ctx) {
    const moduleKey = resolveSarahModuleKey(ctx);
    const sarahKey = MODULE_TO_SARAH_KEY[moduleKey];
    if (!sarahKey || !ctx.industryPreset?.preset?.sarahMapping) return null;
    return ctx.industryPreset.preset.sarahMapping[sarahKey] || null;
}

/**
 * Short workspace hint fragment (included in buildWorkspaceContextHint).
 * @param {{ industryPreset?: object }} ctx
 */
export function buildIndustryPresetWorkspaceHint(ctx) {
    if (!ctx.industryPreset?.active) return "";
    const mapping = mappingForContext(ctx);
    const header = `Industry preset: ${ctx.industryPreset.name} (${ctx.industryPreset.presetId} v${ctx.industryPreset.version})`;
    if (!mapping) return header;
    return `${header}. Module focus: ${mapping.purpose}`;
}

/**
 * Per-turn system addendum — terminology and capability honesty.
 * @param {{ industryPreset?: object, financeSarah?: boolean, hrSarah?: boolean, adminSarah?: boolean }} ctx
 */
export function industryPresetTurnSystemAddendum(ctx) {
    if (!ctx.industryPreset?.active) return "";
    const mapping = mappingForContext(ctx);
    if (!mapping) return "";

    const parts = ["\n\n[INDUSTRY PRESET — configuration guidance only; permissions unchanged]"];
    parts.push(`Purpose: ${mapping.purpose}`);

    for (const blockId of mapping.instructionBlockIds || []) {
        const block = loadInstructionBlock(blockId);
        if (block?.body) parts.push(block.body);
    }

    const gaps = summariseCapabilityGaps(mapping.capabilities || []);
    if (gaps.length) {
        parts.push(`Capabilities not fully available: ${gaps.join(" ")}`);
    }

    const available = (mapping.capabilities || [])
        .map((id) => getPlatformCapability(id))
        .filter((c) => c && c.class === "available")
        .map((c) => c.label)
        .filter(Boolean);
    if (available.length) {
        parts.push(`Operational capabilities for this module include: ${available.join("; ")}.`);
    }

    const moduleKey = resolveSarahModuleKey(ctx);
    if (moduleKey === "operations" && ctx.industryPreset?.industry === "automotive") {
        parts.push(
            "Sarah Operations tool surface: listTasks and createTask only for task writes. No updateTask tool — task completion happens in Operations → Tasks. Automotive inventory and dashboard aggregates are not exposed as Sarah tools; use Command Centre in the portal for those reads."
        );
    }

    parts.push(
        "Do not claim tools or data exist outside Sarah allowlists and tenant permissions. Preset text does not grant new permissions."
    );

    return `${parts.join("\n")}\n`;
}
