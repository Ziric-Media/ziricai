/**
 * Industry preset activation — validate, pin version on company, audit-friendly report.
 * Does not modify Sarah tool policies or grant permissions from preset configuration.
 */
import { getCompany, updateCompany } from "../tenants/companyService.js";
import {
    getIndustryPresetDocument,
    listIndustryPresetCatalogue,
    isPresetStatusActivatable,
} from "./industryPresetRegistry.js";
import { validateIndustryPreset, summariseCapabilityGaps } from "./industryPresetValidator.js";
import { getPlatformCapability } from "./industryPresetCapabilities.js";

function now() {
    return new Date().toISOString();
}

function allowValidatedActivation(auth) {
    if (auth?.isSuperAdmin) return true;
    return process.env.INDUSTRY_PRESET_ALLOW_VALIDATED_ACTIVATION === "1";
}

export function listIndustryPresetsForTenantApi() {
    const catalogue = listIndustryPresetCatalogue();
    const presets = [];
    for (const entry of catalogue) {
        for (const version of entry.versions) {
            const doc = getIndustryPresetDocument(entry.presetId, version);
            if (!doc) continue;
            presets.push({
                presetId: doc.presetId,
                version: doc.version,
                name: doc.name,
                industry: doc.industry,
                status: doc.status,
                description: doc.description,
                activatable: isPresetStatusActivatable(doc.status, { allowValidated: false }),
            });
        }
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name));
}

function evaluateChecklistItem(itemId, company) {
    switch (itemId) {
        case "business_identity":
            return Boolean(String(company?.name || "").trim());
        case "jurisdiction":
            return Boolean(
                String(company?.country || "").trim() ||
                    String(company?.region || "").trim() ||
                    String(company?.industry || "").trim() ||
                    (Array.isArray(company?.jurisdictions) && company.jurisdictions.length)
            );
        case "finance_baseline":
            return true;
        case "tasks_baseline":
            return true;
        case "knowledge_seed":
            return true;
        case "compliance_review":
            return true;
        default:
            return true;
    }
}

export function buildIndustryPresetReadiness(company, preset) {
    const checklistIds = preset?.onboarding?.checklist || [];
    const items = checklistIds.map((id) => {
        const ok = evaluateChecklistItem(id, company);
        return {
            id,
            ok,
            message: ok ? "OK" : `Complete "${id}" before activation.`,
        };
    });
    const blocking = items.filter((i) => !i.ok && ["business_identity", "jurisdiction"].includes(i.id));
    return {
        items,
        ready: blocking.length === 0,
        blockingCount: blocking.length,
    };
}

export async function previewIndustryPresetActivation(companyId, presetId, version, auth = {}) {
    const company = await getCompany(companyId);
    if (!company) {
        return { ok: false, code: "COMPANY_NOT_FOUND", message: "Company not found." };
    }

    const preset = getIndustryPresetDocument(presetId, version);
    if (!preset) {
        return { ok: false, code: "PRESET_NOT_FOUND", message: "Preset not found." };
    }

    const requireApproved = !allowValidatedActivation(auth);
    const validation = validateIndustryPreset(preset, { activation: requireApproved });
    const readiness = buildIndustryPresetReadiness(company, preset);
    const capabilityNotes = summariseCapabilityGaps(
        Object.values(preset.sarahMapping || {}).flatMap((m) => m.capabilities || [])
    );

    return {
        ok: validation.valid && readiness.ready,
        preset: {
            presetId: preset.presetId,
            version: preset.version,
            name: preset.name,
            status: preset.status,
            industry: preset.industry,
        },
        current: {
            industryPresetId: company.industryPresetId || null,
            industryPresetVersion: company.industryPresetVersion || null,
            industryPresetActivatedAt: company.industryPresetActivatedAt || null,
        },
        validation,
        readiness,
        capabilityNotes,
    };
}

export async function activateIndustryPresetForCompany(companyId, { presetId, version }, auth = {}) {
    const preview = await previewIndustryPresetActivation(companyId, presetId, version, auth);
    if (!preview.preset) {
        return preview;
    }

    const preset = getIndustryPresetDocument(presetId, version);
    const allowValidated = allowValidatedActivation(auth);
    if (!isPresetStatusActivatable(preset.status, { allowValidated })) {
        return {
            ok: false,
            code: "PRESET_NOT_ACTIVATABLE",
            message: `Preset status "${preset.status}" cannot be activated.`,
        };
    }

    if (!preview.validation?.valid) {
        return {
            ok: false,
            code: "VALIDATION_FAILED",
            message: "Preset validation failed.",
            validation: preview.validation,
        };
    }

    if (!preview.readiness?.ready) {
        return {
            ok: false,
            code: "READINESS_INCOMPLETE",
            message: "Onboarding checklist incomplete.",
            readiness: preview.readiness,
        };
    }

    const activatedAt = now();
    const existing = await getCompany(companyId);
    const updated = await updateCompany(companyId, {
        industryPresetId: preset.presetId,
        industryPresetVersion: preset.version,
        industryPresetActivatedAt: activatedAt,
        industry: companyIndustryAlign(preview, existing),
        sector: preset.industry || existing?.sector || undefined,
    });

    return {
        ok: true,
        company: {
            id: updated.id,
            industryPresetId: updated.industryPresetId,
            industryPresetVersion: updated.industryPresetVersion,
            industryPresetActivatedAt: updated.industryPresetActivatedAt,
            industry: updated.industry,
        },
        validation: preview.validation,
        readiness: preview.readiness,
        activatedAt,
    };
}

function companyIndustryAlign(preview, company) {
    if (String(company?.industry || "").trim()) return company.industry;
    return preview.preset?.industry || company?.industry || "";
}

export async function deactivateIndustryPresetForCompany(companyId) {
    const company = await getCompany(companyId);
    if (!company) {
        return { ok: false, code: "COMPANY_NOT_FOUND", message: "Company not found." };
    }
    if (!company.industryPresetActivatedAt) {
        return { ok: true, alreadyInactive: true };
    }

    const updated = await updateCompany(companyId, {
        industryPresetActivatedAt: null,
    });

    return {
        ok: true,
        company: {
            id: updated.id,
            industryPresetId: updated.industryPresetId,
            industryPresetVersion: updated.industryPresetVersion,
            industryPresetActivatedAt: updated.industryPresetActivatedAt,
        },
    };
}

export function summarisePresetCapabilitiesForModule(preset, moduleKey) {
    const mapping = preset?.sarahMapping?.[moduleKey];
    if (!mapping) return [];
    return (mapping.capabilities || []).map((id) => ({
        id,
        ...(getPlatformCapability(id) || { class: "unknown" }),
    }));
}
