/**
 * Ensure Smile More Dentists (smilemore-demo) is a production dental-clinic preset tenant.
 * Idempotent — safe on every API startup.
 */
import { getCompany, createCompany, updateCompany } from "../tenants/companyService.js";
import { applyDentalClinicPreset } from "../dental/dentalPresetProvisioning.js";
import { LEGACY_SMILEMORE_COMPANY_ID, isDentalClinicPresetConfigured } from "../dental/dentalIndustryPreset.js";
import {
    SMILEMORE_CONTACTS,
    SMILEMORE_LOCATIONS,
    SMILEMORE_SERVICES,
    SMILEMORE_CHANNELS,
    SMILEMORE_TIMEZONE,
    SMILEMORE_SLOT_MINUTES,
} from "../dental/smilemorePractice.js";

const SMILEMORE_PRACTICE_OVERRIDES = {
    timezone: SMILEMORE_TIMEZONE,
    slotMinutes: SMILEMORE_SLOT_MINUTES,
    locations: SMILEMORE_LOCATIONS.map((item) => ({ ...item })),
    services: SMILEMORE_SERVICES.map((item) => ({ ...item })),
    channels: SMILEMORE_CHANNELS.map((item) => ({ ...item })),
    contacts: { ...SMILEMORE_CONTACTS },
};

export async function ensureSmilemoreDentalProductionTenant() {
    const companyId = LEGACY_SMILEMORE_COMPANY_ID;
    let company = await getCompany(companyId);

    if (!company) {
        await createCompany(companyId, {
            name: "Smile More Dentists",
            industry: "dental",
            plan: "business",
            status: "active",
            email: "inquiries@smilemoredentists.co.za",
            phone: SMILEMORE_CONTACTS.phone,
            website: "https://smilemoredentists.co.za",
            owner: "Dr. Priya Naidoo",
            ownerEmail: "priya@smilemore.co.za",
            settings: {
                tenantClass: "PRODUCTION CUSTOMER",
                productionCustomer: true,
            },
        });
        company = await getCompany(companyId);
    }

    const needsPreset = !isDentalClinicPresetConfigured(company);
    const needsProductionClass =
        company?.settings?.tenantClass !== "PRODUCTION CUSTOMER" || company?.settings?.productionCustomer !== true;

    if (needsPreset) {
        await applyDentalClinicPreset(companyId, {
            tenantClass: "PRODUCTION CUSTOMER",
            practiceOverrides: SMILEMORE_PRACTICE_OVERRIDES,
        });
    } else if (needsProductionClass) {
        await updateCompany(companyId, {
            settings: {
                ...(company.settings || {}),
                tenantClass: "PRODUCTION CUSTOMER",
                productionCustomer: true,
                dentalPractice: {
                    ...(company.settings?.dentalPractice || {}),
                    enabled: true,
                    ...SMILEMORE_PRACTICE_OVERRIDES,
                },
            },
        });
    }

    return { companyId, migrated: needsPreset || needsProductionClass };
}
