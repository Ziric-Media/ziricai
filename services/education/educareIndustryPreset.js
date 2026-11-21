/**
 * Educare / school tenant detection for Company Sarah routing.
 */
import { EDUCARE_COMPANY_ID } from "./educareDefaults.js";
import { schoolRequiresVerifiedGuardians } from "./schoolGuardianService.js";
import { getPortalCompanyAsync } from "../portal/portalDemo.js";

/**
 * @param {string} companyId
 * @param {object|null} [company]
 */
export function isEducareSchoolCompany(companyId, company = null) {
    if (companyId === EDUCARE_COMPANY_ID) return true;
    return schoolRequiresVerifiedGuardians(company);
}

/**
 * @param {string} companyId
 */
export async function shouldRunEducareSchoolChat(companyId) {
    const company = await getPortalCompanyAsync(companyId).catch(() => null);
    const record = company?.company || company;
    return isEducareSchoolCompany(companyId, record);
}