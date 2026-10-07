/**
 * Organisation segment taxonomy for Platform Intelligence (network analytics).
 * Separate from tenant lifecycle class — see docs/architecture/TENANT_TAXONOMY.md
 */

export const ORGANISATION_TYPE = {
    COMPANY: 'company',
    GOVERNMENT: 'government',
    POLITICAL_PUBLIC_SERVICE: 'political_public_service',
};

export const ORGANISATION_TYPE_LABELS = {
    [ORGANISATION_TYPE.COMPANY]: 'Companies',
    [ORGANISATION_TYPE.GOVERNMENT]: 'Government',
    [ORGANISATION_TYPE.POLITICAL_PUBLIC_SERVICE]: 'Political / Public Service',
};

/** @type {Record<string, { id: string, label: string }[]>} */
export const SECTORS_BY_ORGANISATION_TYPE = {
    [ORGANISATION_TYPE.COMPANY]: [
        { id: 'automotive', label: 'Automotive' },
        { id: 'financial_services', label: 'Financial Services' },
        { id: 'mining', label: 'Mining' },
        { id: 'mining_resources', label: 'Mining & Resources' },
        { id: 'retail', label: 'Retail' },
        { id: 'manufacturing', label: 'Manufacturing' },
        { id: 'telecommunications', label: 'Telecommunications' },
        { id: 'technology', label: 'Technology' },
        { id: 'healthcare', label: 'Healthcare' },
        { id: 'education', label: 'Education' },
        { id: 'hospitality_tourism', label: 'Hospitality & Tourism' },
        { id: 'tourism_hospitality', label: 'Tourism & Hospitality' },
        { id: 'logistics_transport', label: 'Logistics & Transport' },
        { id: 'transport_logistics', label: 'Transport & Logistics' },
        { id: 'construction', label: 'Construction' },
        { id: 'real_estate', label: 'Real Estate' },
        { id: 'agriculture', label: 'Agriculture' },
        { id: 'energy', label: 'Energy' },
        { id: 'professional_services', label: 'Professional Services' },
        { id: 'media_entertainment', label: 'Media & Entertainment' },
        { id: 'security', label: 'Security' },
        { id: 'legal', label: 'Legal' },
        { id: 'insurance', label: 'Insurance' },
        { id: 'food_beverage', label: 'Food & Beverage' },
        { id: 'non_profit', label: 'Non-profit / NGO' },
        { id: 'other', label: 'Other' },
    ],
    [ORGANISATION_TYPE.GOVERNMENT]: [
        { id: 'national_government', label: 'National Government' },
        { id: 'provincial_government', label: 'Provincial Government' },
        { id: 'local_government', label: 'Local Government' },
        { id: 'government_agency', label: 'Government Agency' },
        { id: 'public_institution', label: 'Public Institution' },
        { id: 'other', label: 'Other' },
    ],
    [ORGANISATION_TYPE.POLITICAL_PUBLIC_SERVICE]: [
        { id: 'political_organisation', label: 'Political Organisation' },
        { id: 'political_office', label: 'Political Office' },
        { id: 'elected_representative', label: 'Elected Representative' },
        { id: 'civic_organisation', label: 'Civic Organisation' },
        { id: 'public_service', label: 'Public Service' },
        { id: 'other', label: 'Other' },
    ],
};

export const PLATFORM_CHANNELS = ['whatsapp', 'messenger', 'email', 'web_chat'];

/** Map legacy / shorthand sector ids to canonical taxonomy ids (extensible without schema changes). */
export const SECTOR_ID_ALIASES = {
    hospitality: 'hospitality_tourism',
    tourism: 'tourism_hospitality',
    logistics: 'logistics_transport',
    transport: 'transport_logistics',
    ngo: 'non_profit',
    nonprofit: 'non_profit',
    non_profit_ngo: 'non_profit',
    telecom: 'telecommunications',
    finance: 'financial_services',
    fintech: 'financial_services',
    auto: 'automotive',
    motors: 'automotive',
};

/**
 * @param {string|null|undefined} organisationType
 * @returns {string}
 */
export function normalizeOrganisationType(organisationType) {
    const raw = String(organisationType || '').trim().toLowerCase();
    if (raw === 'government') return ORGANISATION_TYPE.GOVERNMENT;
    if (raw === 'political_public_service' || raw === 'political' || raw === 'public_service') {
        return ORGANISATION_TYPE.POLITICAL_PUBLIC_SERVICE;
    }
    return ORGANISATION_TYPE.COMPANY;
}

/**
 * @param {string} organisationType
 * @param {string|null|undefined} sectorId
 * @returns {{ id: string, label: string }|null}
 */
export function resolveSector(organisationType, sectorId) {
    const type = normalizeOrganisationType(organisationType);
    const list = SECTORS_BY_ORGANISATION_TYPE[type] || [];
    let id = String(sectorId || '').trim().toLowerCase();
    if (!id) return null;
    if (SECTOR_ID_ALIASES[id]) id = SECTOR_ID_ALIASES[id];
    const direct = list.find((s) => s.id === id);
    if (direct) return direct;
    const aliased = SECTOR_ID_ALIASES[id] ? list.find((s) => s.id === SECTOR_ID_ALIASES[id]) : null;
    return aliased || null;
}

/**
 * @param {{ organisationType?: string, industry?: string, industryId?: string }} company
 * @returns {{ organisationType: string, sectorId: string|null, sectorLabel: string|null }}
 */
export function segmentFromCompanyRecord(company = {}) {
    const organisationType = normalizeOrganisationType(
        company.organisationType || company.organizationType
    );
    let sectorId = company.sector || company.sectorId || null;
    if (!sectorId && company.industryId) {
        sectorId = String(company.industryId).toLowerCase().replace(/\s+/g, '_');
    }
    if (sectorId && SECTOR_ID_ALIASES[String(sectorId).toLowerCase()]) {
        sectorId = SECTOR_ID_ALIASES[String(sectorId).toLowerCase()];
    }
    const sector = resolveSector(organisationType, sectorId);
    return {
        organisationType,
        sectorId: sector?.id || sectorId || null,
        sectorLabel: sector?.label || company.industry || null,
    };
}
