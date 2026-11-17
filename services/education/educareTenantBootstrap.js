/**
 * EDU-01 / EDU-02 — post-provision Educare profile, campuses, KB seed.
 */
import { updateCompany, getCompany } from "../tenants/companyService.js";
import { seedEducareKnowledge } from "./seedEducareKnowledge.js";
import { EDUCARE_CAMPUSES, defaultEducationSettings } from "./educareDefaults.js";

export async function bootstrapEducareCompanyProfile(companyId) {
    const company = await getCompany(companyId);
    if (!company) throw new Error(`Company not found: ${companyId}`);

    await updateCompany(companyId, {
        industry: "Education",
        phone: "+27 14 592 2854",
        email: company.email || "info@educarechristianschool.co.za",
        campuses: EDUCARE_CAMPUSES,
        settings: {
            ...(company.settings || {}),
            tenantClass: company.settings?.tenantClass || "PILOT",
            education: { ...defaultEducationSettings(), campusesCatalog: EDUCARE_CAMPUSES.map((c) => c.id) },
            campuses: EDUCARE_CAMPUSES,
            campusesPublic: EDUCARE_CAMPUSES.map(({ id, name, kind, address, hours, gradesText }) => ({
                id,
                name,
                kind,
                address,
                hours,
                gradesText,
            })),
        },
    });

    const kb = await seedEducareKnowledge(companyId);

    return { companyId, campuses: EDUCARE_CAMPUSES.length, knowledgeBase: kb };
}
