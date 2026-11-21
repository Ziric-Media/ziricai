import { getCompany } from "../tenants/companyService.js";
import { isDentalPracticeCompany } from "./dentalIndustryPreset.js";

export async function isDentalPracticeTenant(companyId) {
    const company = await getCompany(companyId);
    return isDentalPracticeCompany(companyId, company);
}

/**
 * @param {string} companyId
 * @param {string} [message]
 */
export async function assertDentalPracticeTenant(companyId, message = "This feature is only available for dental-clinic tenants.") {
    const company = await getCompany(companyId);
    if (!isDentalPracticeCompany(companyId, company)) {
        throw new Error(message);
    }
    return company;
}
