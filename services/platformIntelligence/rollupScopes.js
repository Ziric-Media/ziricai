export const ROLLUP_SCOPE = {
    ORGANISATION: "organisation",
    PLATFORM: "platform",
    ORGANISATION_TYPE: "organisation_type",
    ORGANISATION_TYPE_SECTOR: "organisation_type_sector",
};

export function encodeDimensionalRollupId({ grain, periodKey, scope, scopeKey, channel }) {
    const parts = [grain, periodKey, scope, scopeKey, channel].map((p) =>
        String(p || "")
            .trim()
            .replace(/\|/g, "_")
    );
    return parts.join("|");
}

export function organisationTypeScopeKey(organisationType) {
    return String(organisationType || "company");
}

export function sectorScopeKey(organisationType, sectorId) {
    return `${organisationTypeScopeKey(organisationType)}::${String(sectorId || "other")}`;
}
