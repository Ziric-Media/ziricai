/**
 * Dental clinic industry preset identity (platform presets for all dental tenants).
 */
import {
    getIndustryPresetDocument,
    isPresetStatusActivatable,
} from "../platform/industryPresetRegistry.js";
import { resolveIndustryPresetForTenant } from "../platform/industryPresetContext.js";

export const DENTAL_CLINIC_PRESET_ID = "dental-clinic";
export const DENTAL_CLINIC_PRESET_VERSION = "1.0.0";

/** Legacy flagship tenant id (production customer; slug retained for URLs). */
export const LEGACY_SMILEMORE_COMPANY_ID = "smilemore-demo";

export function isDentalClinicPresetConfigured(company) {
    if (!company?.industryPresetActivatedAt) return false;
    return String(company.industryPresetId || "").trim() === DENTAL_CLINIC_PRESET_ID;
}

/**
 * Whether this workspace should use dental practice modules (portal + API).
 * @param {string} companyId
 * @param {object|null} [company]
 */
export function isDentalPracticeCompany(companyId, company = null) {
    const id = String(companyId || "").trim().toLowerCase();
    if (company) {
        if (isDentalClinicPresetConfigured(company)) return true;
        if (company.settings?.dentalPractice?.enabled === true) return true;
    }
    return id === LEGACY_SMILEMORE_COMPANY_ID;
}

export function resolveDentalIndustryKey(industry) {
    const raw = String(industry || "").trim().toLowerCase();
    if (!raw) return false;
    if (raw === "dental") return true;
    return raw.includes("dent") || raw.includes("ortho");
}

/**
 * @param {object} company
 */
export async function assertDentalClinicPresetActive(company) {
    if (!company) {
        throw Object.assign(new Error("Company not found"), { status: 404, code: "COMPANY_NOT_FOUND" });
    }
    if (!isDentalClinicPresetConfigured(company)) {
        throw Object.assign(new Error("Dental clinic industry preset is not active for this tenant"), {
            status: 403,
            code: "DENTAL_PRESET_NOT_ACTIVE",
        });
    }
    const resolved = await resolveIndustryPresetForTenant(company);
    if (!resolved.active || resolved.preset?.presetId !== DENTAL_CLINIC_PRESET_ID) {
        throw Object.assign(
            new Error(resolved.reason || "Dental clinic industry preset is not active for this tenant"),
            { status: 403, code: "DENTAL_PRESET_NOT_ACTIVE", detail: resolved }
        );
    }
    const preset = getIndustryPresetDocument(DENTAL_CLINIC_PRESET_ID);
    if (!preset || !isPresetStatusActivatable(preset.status)) {
        throw Object.assign(new Error("Dental clinic preset package is not activatable"), {
            status: 503,
            code: "DENTAL_PRESET_UNAVAILABLE",
        });
    }
    return resolved;
}
