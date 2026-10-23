/**
 * Automotive industry preset identity and live-KPI mode (no demo fallback merge).
 */
import {
    getIndustryPresetDocument,
    isPresetStatusActivatable,
} from "../platform/industryPresetRegistry.js";
import { resolveIndustryPresetForTenant } from "../platform/industryPresetContext.js";

export const AUTOMOTIVE_PRESET_ID = "automotive-dealership";

export function isAutomotivePresetConfigured(company) {
    if (!company?.industryPresetActivatedAt) return false;
    return String(company.industryPresetId || "").trim() === AUTOMOTIVE_PRESET_ID;
}

/**
 * Provisioned tenant with Automotive preset activated — portal KPIs must not use demoMetrics().
 * @param {{ companyRecord?: object|null, isProvisioned?: boolean }} ctx
 */
export function shouldUseAutomotiveLiveKpis(ctx = {}) {
    const { companyRecord, isProvisioned } = ctx;
    if (!isProvisioned || !companyRecord) return false;
    if (!isAutomotivePresetConfigured(companyRecord)) return false;
    const preset = getIndustryPresetDocument(AUTOMOTIVE_PRESET_ID);
    if (!preset || !isPresetStatusActivatable(preset.status)) return false;
    return true;
}

/**
 * @param {object} company — tenant company record from getCompany
 * @throws {Error & { status?: number, code?: string }}
 */
export async function assertAutomotivePresetActive(company) {
    if (!company) {
        throw Object.assign(new Error("Company not found"), { status: 404, code: "COMPANY_NOT_FOUND" });
    }
    if (!isAutomotivePresetConfigured(company)) {
        throw Object.assign(new Error("Automotive industry preset is not active for this tenant"), {
            status: 403,
            code: "AUTOMOTIVE_PRESET_NOT_ACTIVE",
        });
    }
    const resolved = await resolveIndustryPresetForTenant(company);
    if (!resolved.active || resolved.preset?.presetId !== AUTOMOTIVE_PRESET_ID) {
        throw Object.assign(
            new Error(resolved.reason || "Automotive industry preset is not active for this tenant"),
            { status: 403, code: "AUTOMOTIVE_PRESET_NOT_ACTIVE", detail: resolved }
        );
    }
    return resolved;
}
