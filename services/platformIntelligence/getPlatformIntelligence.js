/**
 * Unified Platform Intelligence read facade (PI-4C).
 * Dashboard + Sarah + APIs must use this for consistent numbers.
 */
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { listDimensionalRollups } from "./dimensionalRollups.js";
import { getPeriodUserRollup } from "./periodUserRollups.js";
import { PERIOD_GRAINS, periodKeyForGrain, previousPeriodKey, utcDateKey } from "./periodKeys.js";
import { sectorScopeKey } from "./rollupScopes.js";
import { PI_CHANNELS } from "./constants.js";
import {
    aggregateByOrganisation,
    aggregateByOrganisationType,
    aggregateBySector,
    messageTotalsFromRollup,
    pickPlatformRollup,
} from "./rollupAggregate.js";
import { segmentFromCompanyRecord } from "../../js/shared/organisationTaxonomy.js";
import { classifyTenant } from "../../js/shared/tenantClassification.js";
import { getPlatformSupportReadModel } from "../support/platformSupportReadModel.js";

function resolveQuery(query = {}) {
    const period = String(query.period || "day").trim().toLowerCase();
    if (!PERIOD_GRAINS.includes(period)) {
        return { error: `Unsupported period "${period}"`, supportedPeriods: PERIOD_GRAINS };
    }
    const anchor = query.date || query.periodKey || utcDateKey(new Date());
    const periodKey =
        period === "day"
            ? String(anchor).slice(0, 10)
            : periodKeyForGrain(period, `${String(anchor).slice(0, 10)}T12:00:00.000Z`);
    return { period, periodKey };
}

async function organisationCensus() {
    let companies = [];
    try {
        companies = await listAllCompaniesFromStorage();
    } catch {
        companies = [];
    }
    const byOrganisationType = {};
    const bySector = {};
    for (const c of companies) {
        const seg = segmentFromCompanyRecord(c);
        const type = seg.organisationType;
        byOrganisationType[type] = (byOrganisationType[type] || 0) + 1;
        const sk = `${type}::${seg.sectorId || "other"}`;
        bySector[sk] = (bySector[sk] || 0) + 1;
    }
    return {
        totalOrganisations: companies.length,
        activeOrganisations: null,
        byOrganisationType,
        bySector,
        organisations: companies.map((c) => ({
            companyId: c.id,
            name: c.name || c.id,
            classification: classifyTenant(c)?.classification,
            ...segmentFromCompanyRecord(c),
        })),
    };
}

function growthDelta(current, previous) {
    const c = Number(current || 0);
    const p = Number(previous || 0);
    return { current: c, previous: p, delta: c - p };
}

function enrichByOrganisationType(rows, census, userByType) {
    return rows.map((row) => ({
        ...row,
        organisations: Number(census.byOrganisationType[row.organisationType] || 0),
        uniquePlatformUsersActive: Number(
            userByType?.[row.organisationType]?.uniquePlatformUsersActive || 0
        ),
    }));
}

function enrichBySector(rows, census, userBySector) {
    return rows.map((row) => {
        const sk = sectorScopeKey(row.organisationType, row.sectorId);
        return {
            ...row,
            organisations: Number(census.bySector[sk] || 0),
            uniquePlatformUsersActive: Number(
                userBySector?.[sk]?.uniquePlatformUsersActive || 0
            ),
        };
    });
}

/**
 * @param {{ period?: string, date?: string, periodKey?: string, channel?: string }} query
 */
export async function getPlatformIntelligence(query = {}) {
    const resolved = resolveQuery(query);
    if (resolved.error) {
        return {
            generatedAt: new Date().toISOString(),
            ...resolved,
        };
    }

    const { period, periodKey } = resolved;
    const channel = String(query.channel || PI_CHANNELS.WHATSAPP).toLowerCase();

    const rollups = await listDimensionalRollups(period, periodKey);
    const userRollup = await getPeriodUserRollup(period, periodKey);
    const prevKey = previousPeriodKey(period, periodKey);
    const prevRollups = await listDimensionalRollups(period, prevKey);
    const prevUserRollup = await getPeriodUserRollup(period, prevKey);
    const platformRollup = pickPlatformRollup(rollups, channel);
    const prevPlatformRollup = pickPlatformRollup(prevRollups, channel);
    const msgTotals = messageTotalsFromRollup(platformRollup);
    const prevMsgTotals = messageTotalsFromRollup(prevPlatformRollup);

    let companies = [];
    try {
        companies = await listAllCompaniesFromStorage();
    } catch {
        companies = [];
    }
    const nameById = new Map(companies.map((c) => [c.id, c.name || c.id]));

    const census = await organisationCensus();
    const byOrganisation = aggregateByOrganisation(rollups, channel, nameById);
    const organisationsActive = byOrganisation.filter((o) => o.all > 0).length;
    census.activeOrganisations = organisationsActive;

    const byOrganisationType = enrichByOrganisationType(
        aggregateByOrganisationType(rollups, channel),
        census,
        userRollup.byOrganisationType
    );
    const bySector = enrichBySector(
        aggregateBySector(rollups, channel),
        census,
        userRollup.bySector
    );

    let supportSlice = null;
    try {
        supportSlice = await getPlatformSupportReadModel({ summaryOnly: true, maxTenants: 100 });
    } catch {
        supportSlice = {
            meta: { unavailable: true, network: "support", readOnly: true },
            counts: {},
            bySeverity: {},
            attentionQueue: [],
        };
    }

    return {
        period,
        periodKey,
        generatedAt: new Date().toISOString(),
        meta: {
            dataSource: "platform_intelligence_facade",
            readOnly: true,
            channelsIncluded: [PI_CHANNELS.WHATSAPP],
            segmentSnapshots: true,
            note: "Message/people metrics use segment snapshots at event time; org census uses current metadata.",
        },
        communications: {
            totals: {
                messages: {
                    inbound: msgTotals.inbound,
                    outbound: msgTotals.outbound,
                    all: msgTotals.all,
                },
                conversationsActive: msgTotals.conversationsActive,
                uniqueChannelIdentities: msgTotals.uniqueChannelIdentities,
                organisationsActive,
            },
            byChannel: {
                [channel]: msgTotals,
            },
            byOrganisation,
            byOrganisationType,
            bySector,
        },
        userNetwork: {
            totals: {
                uniquePlatformUsersActive: Number(userRollup.uniquePlatformUsersActive || 0),
                newPlatformUsers: Number(userRollup.newPlatformUsers || 0),
                returningPlatformUsersActive: Number(userRollup.returningPlatformUsersActive || 0),
                multiOrganisationUsersActive: Number(userRollup.multiOrganisationUsersActive || 0),
                multiChannelUsersActive: Number(userRollup.multiChannelUsersActive || 0),
            },
            byOrganisationType: userRollup.byOrganisationType || {},
            bySector: userRollup.bySector || {},
        },
        organisationNetwork: census,
        supportNetwork: {
            totals: supportSlice.counts || {},
            bySeverity: supportSlice.bySeverity || {},
            attentionQueue: (supportSlice.attentionQueue || []).slice(0, 10),
            meta: supportSlice.meta || { unavailable: true },
        },
        growthVersusPreviousPeriod: {
            previousPeriodKey: prevKey,
            messages: {
                all: growthDelta(msgTotals.all, prevMsgTotals.all),
                inbound: growthDelta(msgTotals.inbound, prevMsgTotals.inbound),
                outbound: growthDelta(msgTotals.outbound, prevMsgTotals.outbound),
            },
            uniquePlatformUsersActive: growthDelta(
                userRollup.uniquePlatformUsersActive,
                prevUserRollup.uniquePlatformUsersActive
            ),
            organisationsActive: growthDelta(
                organisationsActive,
                aggregateByOrganisation(prevRollups, channel, nameById).filter((o) => o.all > 0)
                    .length
            ),
        },
    };
}
