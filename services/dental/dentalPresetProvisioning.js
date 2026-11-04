/**
 * Activate the dental-clinic industry preset on a tenant (practice template + preset metadata).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIndustryPresetDocument, isPresetStatusActivatable } from "../platform/industryPresetRegistry.js";
import { getCompany, updateCompany } from "../tenants/companyService.js";
import {
    DENTAL_CLINIC_PRESET_ID,
    DENTAL_CLINIC_PRESET_VERSION,
    resolveDentalIndustryKey,
} from "./dentalIndustryPreset.js";

const TEMPLATE_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../shared/industryPresets/practiceTemplates/dental-clinic-default.json"
);

export function loadDentalPracticeTemplate() {
    const raw = fs.readFileSync(TEMPLATE_PATH, "utf8");
    return JSON.parse(raw);
}

/**
 * @param {string} companyId
 * @param {{ practiceOverrides?: object, tenantClass?: string }} [options]
 */
export async function applyDentalClinicPreset(companyId, options = {}) {
    const preset = getIndustryPresetDocument(DENTAL_CLINIC_PRESET_ID, DENTAL_CLINIC_PRESET_VERSION);
    if (!preset || !isPresetStatusActivatable(preset.status)) {
        throw Object.assign(new Error("Dental clinic preset is not activatable"), {
            code: "DENTAL_PRESET_UNAVAILABLE",
        });
    }

    const existing = (await getCompany(companyId)) || { id: companyId };
    const template = loadDentalPracticeTemplate();
    const activatedAt = new Date().toISOString();
    const tenantClass = options.tenantClass || existing.settings?.tenantClass || "PRODUCTION CUSTOMER";

    const dentalPractice = {
        ...template,
        ...(options.practiceOverrides || {}),
        enabled: true,
    };

    return updateCompany(companyId, {
        industry: "dental",
        industryPresetId: DENTAL_CLINIC_PRESET_ID,
        industryPresetVersion: preset._resolvedVersion || DENTAL_CLINIC_PRESET_VERSION,
        industryPresetActivatedAt: activatedAt,
        settings: {
            ...(existing.settings || {}),
            tenantClass,
            productionCustomer: tenantClass === "PRODUCTION CUSTOMER",
            dentalPractice,
        },
    });
}

/**
 * After operator provisioning when industry indicates dental.
 * @param {string} companyId
 * @param {string} industry
 */
export async function maybeApplyDentalPresetForIndustry(companyId, industry) {
    if (!resolveDentalIndustryKey(industry)) return null;
    const company = await getCompany(companyId);
    if (company?.industryPresetActivatedAt && company.industryPresetId === DENTAL_CLINIC_PRESET_ID) {
        return company;
    }
    return applyDentalClinicPreset(companyId);
}
