/**
 * PI-4D — Sarah / MC read models (no LLM math; wraps getPlatformIntelligence + ops facades).
 */
import { getPlatformIntelligence } from "./getPlatformIntelligence.js";
import { PERIOD_GRAINS, previousPeriodKey, utcDateKey, utcMonthKey } from "./periodKeys.js";
import { ORGANISATION_TYPE, ORGANISATION_TYPE_LABELS } from "../../js/shared/organisationTaxonomy.js";
import {
    getPlatformExecutiveOverview,
    getPlatformIntegrationsBoard,
    getPlatformSupportCases,
    getPlatformBillingConsole,
    getPlatformAnalyticsOverview,
} from "../operations/platformMissionControlService.js";
import { PI_CHANNELS } from "./constants.js";

/** Authoritative coverage statement for Sarah / Dashboard (PI-4D truthfulness). */
export const PLATFORM_MEASUREMENT_COVERAGE = {
    instrumentedChannels: [PI_CHANNELS.WHATSAPP],
    pendingChannels: [PI_CHANNELS.MESSENGER, PI_CHANNELS.EMAIL, PI_CHANNELS.WEB_CHAT],
    organisationSegmentSnapshots: true,
    identity: {
        strongMatchChannels: [PI_CHANNELS.WHATSAPP],
        multiChannelCounts: "strong_match_only",
        note: "Messenger, Email, and Web require ingestion + strong identity before official multi-channel totals.",
    },
    notYetMeasured: [
        "Cross-channel people deduplication (pending Messenger, Email, Web ingestion)",
        "Official multi-channel user counts until additional channels use strong identity",
        "Historical backfill before PI-4A go-live (rollups start at event ingestion)",
    ],
};

export function normalizePeriodQuery(args = {}) {
    const period = String(args.period || "day").trim().toLowerCase();
    if (!PERIOD_GRAINS.includes(period)) {
        return { error: `Unsupported period "${period}"`, supportedPeriods: PERIOD_GRAINS };
    }
    const query = { period };
    if (args.periodKey) query.periodKey = String(args.periodKey);
    else if (args.date) query.date = String(args.date);
    return { query };
}

export function pct(part, whole) {
    const p = Number(part || 0);
    const w = Number(whole || 0);
    if (w <= 0) return p === 0 ? 0 : null;
    return Math.round((p / w) * 1000) / 10;
}

export function pctChange(current, previous) {
    const c = Number(current || 0);
    const p = Number(previous || 0);
    if (p === 0) return c === 0 ? 0 : null;
    return Math.round(((c - p) / p) * 1000) / 10;
}

export function buildToolEnvelope(intel, extraMeta = {}) {
    const channels = intel.meta?.channelsIncluded || ["whatsapp"];
    return {
        scope: "platform",
        readOnly: true,
        generatedAt: intel.generatedAt || new Date().toISOString(),
        period: intel.period,
        periodKey: intel.periodKey,
        dataCompleteness: {
            channelsInstrumented: channels,
            channelsPending: PLATFORM_MEASUREMENT_COVERAGE.pendingChannels,
            organisationCensus: "current_company_metadata",
            communicationsAndPeople: "dimensional_rollups_with_segment_snapshots",
            measurementCoverage: PLATFORM_MEASUREMENT_COVERAGE,
            partial: Boolean(intel.error),
            notes: [
                intel.meta?.note,
                intel.error ? String(intel.error) : null,
            ].filter(Boolean),
        },
        ...extraMeta,
    };
}

export async function loadPlatformIntelligence(args = {}) {
    const normalized = normalizePeriodQuery(args);
    if (normalized.error) {
        return {
            generatedAt: new Date().toISOString(),
            error: normalized.error,
            supportedPeriods: normalized.supportedPeriods,
        };
    }
    return getPlatformIntelligence(normalized.query);
}

export async function getSectorBreakdownReadModel(args = {}) {
    const intel = await loadPlatformIntelligence(args);
    if (intel.error) return { intel, envelope: buildToolEnvelope(intel), sectors: [] };

    const organisationType = String(args.organisationType || ORGANISATION_TYPE.COMPANY).toLowerCase();
    const top = Math.min(Math.max(Number(args.top) || 10, 1), 50);

    const census = intel.organisationNetwork || {};
    const typeOrgTotal = Number(census.byOrganisationType?.[organisationType] || 0);
    const messageTotal = Number(intel.communications?.totals?.messages?.all || 0);
    const peopleTotal = Number(intel.userNetwork?.totals?.uniquePlatformUsersActive || 0);

    const rows = (intel.communications?.bySector || [])
        .filter((r) => r.organisationType === organisationType)
        .map((r) => ({
            organisationType: r.organisationType,
            sectorId: r.sectorId,
            sectorLabel: r.sectorLabel,
            organisations: Number(r.organisations || 0),
            organisationsShareOfTypePct: pct(r.organisations, typeOrgTotal),
            messages: {
                inbound: r.inbound,
                outbound: r.outbound,
                all: r.all,
                shareOfMessagesPct: pct(r.all, messageTotal),
            },
            uniquePlatformUsersActive: Number(r.uniquePlatformUsersActive || 0),
            peopleShareOfPeriodPct: pct(r.uniquePlatformUsersActive, peopleTotal),
        }))
        .sort((a, b) => b.messages.all - a.messages.all)
        .slice(0, top);

    return {
        intel,
        envelope: buildToolEnvelope(intel, {
            organisationType,
            organisationTypeLabel: ORGANISATION_TYPE_LABELS[organisationType] || organisationType,
            totals: { typeOrganisations: typeOrgTotal, messages: messageTotal, people: peopleTotal },
        }),
        sectors: rows,
    };
}

export async function comparePlatformPeriodsReadModel(args = {}) {
    const period = String(args.period || "month").trim().toLowerCase();
    const currentKey =
        args.periodKey ||
        args.date ||
        (period === "month" ? utcMonthKey(new Date()) : utcDateKey(new Date()));
    const previousKey = args.comparePeriodKey || previousPeriodKey(period, currentKey);

    const [current, previous] = await Promise.all([
        getPlatformIntelligence({ period, periodKey: currentKey }),
        getPlatformIntelligence({ period, periodKey: previousKey }),
    ]);

    const curMsg = current.communications?.totals?.messages || {};
    const prevMsg = previous.communications?.totals?.messages || {};
    const curUsers = current.userNetwork?.totals || {};
    const prevUsers = previous.userNetwork?.totals || {};

    const comparison = {
        period,
        currentPeriodKey: current.periodKey || currentKey,
        previousPeriodKey: previous.periodKey || previousKey,
        messages: {
            all: {
                current: curMsg.all,
                previous: prevMsg.all,
                delta: Number(curMsg.all || 0) - Number(prevMsg.all || 0),
                percentChange: pctChange(curMsg.all, prevMsg.all),
            },
            inbound: {
                current: curMsg.inbound,
                previous: prevMsg.inbound,
                delta: Number(curMsg.inbound || 0) - Number(prevMsg.inbound || 0),
                percentChange: pctChange(curMsg.inbound, prevMsg.inbound),
            },
            outbound: {
                current: curMsg.outbound,
                previous: prevMsg.outbound,
                delta: Number(curMsg.outbound || 0) - Number(prevMsg.outbound || 0),
                percentChange: pctChange(curMsg.outbound, prevMsg.outbound),
            },
        },
        uniquePlatformUsersActive: {
            current: curUsers.uniquePlatformUsersActive,
            previous: prevUsers.uniquePlatformUsersActive,
            delta:
                Number(curUsers.uniquePlatformUsersActive || 0) -
                Number(prevUsers.uniquePlatformUsersActive || 0),
            percentChange: pctChange(
                curUsers.uniquePlatformUsersActive,
                prevUsers.uniquePlatformUsersActive
            ),
        },
        organisationsActive: {
            current: current.communications?.totals?.organisationsActive,
            previous: previous.communications?.totals?.organisationsActive,
            delta:
                Number(current.communications?.totals?.organisationsActive || 0) -
                Number(previous.communications?.totals?.organisationsActive || 0),
            percentChange: pctChange(
                current.communications?.totals?.organisationsActive,
                previous.communications?.totals?.organisationsActive
            ),
        },
    };

    let sectorCompare = null;
    const sectorIds = Array.isArray(args.sectorIds)
        ? args.sectorIds.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
        : [];
    if (sectorIds.length) {
        const orgType = String(args.organisationType || ORGANISATION_TYPE.COMPANY).toLowerCase();
        sectorCompare = sectorIds.map((sectorId) => {
            const curRow = (current.communications?.bySector || []).find(
                (r) => r.organisationType === orgType && r.sectorId === sectorId
            );
            const prevRow = (previous.communications?.bySector || []).find(
                (r) => r.organisationType === orgType && r.sectorId === sectorId
            );
            return {
                sectorId,
                sectorLabel: curRow?.sectorLabel || prevRow?.sectorLabel || sectorId,
                messages: {
                    current: curRow?.all || 0,
                    previous: prevRow?.all || 0,
                    delta: Number(curRow?.all || 0) - Number(prevRow?.all || 0),
                    percentChange: pctChange(curRow?.all, prevRow?.all),
                },
                uniquePlatformUsersActive: {
                    current: curRow?.uniquePlatformUsersActive || 0,
                    previous: prevRow?.uniquePlatformUsersActive || 0,
                    percentChange: pctChange(
                        curRow?.uniquePlatformUsersActive,
                        prevRow?.uniquePlatformUsersActive
                    ),
                },
            };
        });
    }

    const envelope = {
        scope: "platform",
        readOnly: true,
        generatedAt: new Date().toISOString(),
        period,
        periodKey: comparison.currentPeriodKey,
        comparePeriodKey: comparison.previousPeriodKey,
        dataCompleteness: {
            channelsInstrumented: current.meta?.channelsIncluded || ["whatsapp"],
            partial: false,
            notes: ["Percent changes computed from Platform Intelligence read models only."],
        },
    };

    return { envelope, comparison, sectorCompare, current, previous };
}

function buildAssessmentFacts({ intel, executive, integrations, support, analytics }) {
    const facts = [];
    const wa = integrations?.platforms?.find((p) => p.id === "whatsapp") || {};
    const notConnected = Number(wa.notConnectedTenants || 0);
    const waErrors = Number(wa.errorTenants || 0);

    if (waErrors === 0) {
        facts.push({
            category: "healthy",
            fact: "WhatsApp integrations report zero tenants in error status.",
            source: "viewPlatformIntegrationsBoard",
        });
    } else {
        facts.push({
            category: "risk",
            fact: `${waErrors} tenant WhatsApp integration(s) are in error status.`,
            source: "viewPlatformIntegrationsBoard",
        });
    }

    if (notConnected > 0) {
        facts.push({
            category: "attention",
            fact: `${notConnected} organisations have no WhatsApp integration connected.`,
            source: "viewPlatformIntegrationsBoard",
        });
    }

    const openSupport = Number(support?.counts?.open || 0);
    if (support?.meta?.unavailable) {
        facts.push({
            category: "healthy",
            fact: "Support case feed is not connected yet; no open-case counts are available.",
            source: "viewPlatformSupportCases",
        });
    } else if (openSupport > 0) {
        facts.push({
            category: "attention",
            fact: `${openSupport} support case(s) are open on the platform.`,
            source: "viewPlatformSupportCases",
        });
    }

    const growth = intel.growthVersusPreviousPeriod?.messages?.all;
    if (growth && growth.delta > 0) {
        facts.push({
            category: "growing",
            fact: `Platform messages increased by ${growth.delta} versus the previous ${intel.period} (${intel.growthVersusPreviousPeriod.previousPeriodKey}).`,
            source: "getPlatformIntelligence",
        });
    }

    const topSector = (intel.communications?.bySector || [])[0];
    if (topSector?.sectorLabel && topSector.all > 0) {
        facts.push({
            category: "growing",
            fact: `${topSector.sectorLabel} generated the highest message volume this ${intel.period} (${topSector.all} messages).`,
            source: "getPlatformIntelligence",
        });
    }

    if (executive?.billing?.partial) {
        facts.push({
            category: "attention",
            fact: "Commercial MRR is based on a partial billing sample; treat as directional.",
            source: "viewPlatformExecutiveOverview",
        });
    }

    const aiPartial = analytics?.deployed?.partial;
    if (aiPartial) {
        facts.push({
            category: "attention",
            fact: "AI employee totals are sampled across tenants (partial count).",
            source: "viewPlatformAnalyticsOverview",
        });
    }

    return facts;
}

export async function generatePlatformOperationsReportReadModel(args = {}) {
    const period = String(args.period || "month").trim().toLowerCase();
    const intel = await loadPlatformIntelligence({ ...args, period });

    const [executive, integrations, support, billing, analytics] = await Promise.all([
        getPlatformExecutiveOverview(),
        getPlatformIntegrationsBoard(),
        getPlatformSupportCases(),
        getPlatformBillingConsole().catch(() => null),
        getPlatformAnalyticsOverview(),
    ]);

    const sectorTop = await getSectorBreakdownReadModel({ ...args, period, top: 15 });

    const report = {
        title: "ZiricAI Platform Operations Report",
        period: intel.period || period,
        periodKey: intel.periodKey,
        generatedAt: new Date().toISOString(),
        executiveSummary: {
            organisations: intel.organisationNetwork?.totalOrganisations,
            organisationsActive: intel.communications?.totals?.organisationsActive,
            uniquePeople: intel.userNetwork?.totals?.uniquePlatformUsersActive,
            messages: intel.communications?.totals?.messages,
            conversationsActive: intel.communications?.totals?.conversationsActive,
            growth: intel.growthVersusPreviousPeriod,
        },
        organisationNetwork: {
            totalOrganisations: intel.organisationNetwork?.totalOrganisations,
            activeOrganisations: intel.organisationNetwork?.activeOrganisations,
            byOrganisationType: intel.organisationNetwork?.byOrganisationType,
            topSectorsByOrganisationCount: Object.entries(intel.organisationNetwork?.bySector || {})
                .map(([key, count]) => ({ key, organisations: count }))
                .sort((a, b) => b.organisations - a.organisations)
                .slice(0, 15),
            byOrganisationTypeActivity: intel.communications?.byOrganisationType,
        },
        userNetwork: intel.userNetwork,
        communications: {
            totals: intel.communications?.totals,
            byChannel: intel.communications?.byChannel,
            byOrganisationType: intel.communications?.byOrganisationType,
            bySector: intel.communications?.bySector,
            topOrganisations: (intel.communications?.byOrganisation || []).slice(0, 10),
        },
        platformHealth: {
            integrations,
            aiEmployeesDeployed: analytics?.deployed?.aiEmployees,
            aiEmployeeSamplePartial: analytics?.deployed?.partial,
            support,
            hubHealth: integrations?.hubHealth,
        },
        commercial: {
            executiveBilling: executive?.billing,
            tenants: executive?.tenants,
            mrr: executive?.billing?.mrr,
            mrrCurrency: executive?.billing?.mrrCurrency,
            billingConsoleRowCount: billing?.rows?.length ?? null,
        },
        growth: {
            versusPreviousPeriod: intel.growthVersusPreviousPeriod,
            newTenantsThisMonth: executive?.growth?.newTenantsThisMonth,
        },
        sectorHighlights: sectorTop.sectors,
        assessmentFacts: buildAssessmentFacts({ intel, executive, integrations, support, analytics }),
    };

    const envelope = buildToolEnvelope(intel, {
        reportKind: "platform_operations",
        dataCompleteness: {
            channelsInstrumented: intel.meta?.channelsIncluded || ["whatsapp"],
            organisationCensus: "current_company_metadata",
            communicationsAndPeople: "dimensional_rollups_with_segment_snapshots",
            commercial: executive?.billing?.partial ? "partial_sample" : "sampled",
            support: support?.meta?.unavailable ? "unavailable" : "live",
            partial: Boolean(intel.error || executive?.billing?.partial),
            notes: [
                intel.meta?.note,
                "Sarah assessment must interpret assessmentFacts only — do not invent metrics.",
            ].filter(Boolean),
        },
    });

    return { envelope, report };
}

/** Shared OpenAI parameter schema for period-scoped PI tools. */
export const PI_PERIOD_PARAMETERS = {
    type: "object",
    properties: {
        period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Reporting grain (default day).",
        },
        date: {
            type: "string",
            description: "Anchor date YYYY-MM-DD (day grain) or period anchor.",
        },
        periodKey: {
            type: "string",
            description: "Explicit period key (YYYY-MM-DD, YYYY-MM, or YYYY-Www).",
        },
    },
};
