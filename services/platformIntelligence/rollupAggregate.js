import { PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID } from "../database/schema.js";
import { ROLLUP_SCOPE } from "./rollupScopes.js";
import { ORGANISATION_TYPE_LABELS } from "../../js/shared/organisationTaxonomy.js";

export function messageTotalsFromRollup(rollup) {
    const inbound = Number(rollup?.inboundMessages || 0);
    const outbound = Number(rollup?.outboundMessages || 0);
    return {
        inbound,
        outbound,
        all: inbound + outbound,
        uniqueChannelIdentities: Number(rollup?.uniqueChannelIdentities || 0),
        conversationsActive: Number(rollup?.conversationsActive || 0),
    };
}

export function pickPlatformRollup(rollups, channel) {
    return rollups.find(
        (r) =>
            r.scope === ROLLUP_SCOPE.PLATFORM &&
            r.scopeKey === PLATFORM_INTELLIGENCE_PLATFORM_COMPANY_ID &&
            r.channel === channel
    );
}

export function aggregateByOrganisationType(rollups, channel) {
    const rows = rollups.filter(
        (r) => r.scope === ROLLUP_SCOPE.ORGANISATION_TYPE && r.channel === channel
    );
    return rows
        .map((r) => ({
            organisationType: r.organisationTypeSnapshot,
            label: ORGANISATION_TYPE_LABELS[r.organisationTypeSnapshot] || r.organisationTypeSnapshot,
            ...messageTotalsFromRollup(r),
        }))
        .sort((a, b) => b.all - a.all);
}

export function aggregateBySector(rollups, channel) {
    const rows = rollups.filter(
        (r) => r.scope === ROLLUP_SCOPE.ORGANISATION_TYPE_SECTOR && r.channel === channel
    );
    return rows
        .map((r) => ({
            organisationType: r.organisationTypeSnapshot,
            sectorId: r.sectorSnapshot,
            sectorLabel: r.sectorLabelSnapshot || r.sectorSnapshot,
            ...messageTotalsFromRollup(r),
        }))
        .sort((a, b) => b.all - a.all);
}

export function aggregateByOrganisation(rollups, channel, nameById) {
    return rollups
        .filter((r) => r.scope === ROLLUP_SCOPE.ORGANISATION && r.channel === channel)
        .map((r) => ({
            companyId: r.scopeKey,
            companyName: nameById.get(r.scopeKey) || r.scopeKey,
            organisationTypeSnapshot: r.organisationTypeSnapshot,
            sectorSnapshot: r.sectorSnapshot,
            sectorLabelSnapshot: r.sectorLabelSnapshot,
            channel: r.channel,
            ...messageTotalsFromRollup(r),
        }))
        .sort((a, b) => b.all - a.all);
}
