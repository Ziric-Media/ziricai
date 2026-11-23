/**
 * MC-PO-01 — unified Mission Control command overview (growth + RS02 + tenant/network slices).
 */
import { getPlatformExecutiveOverview } from "../operations/platformMissionControlService.js";
import { getNetworkStats } from "../network/networkPlatformService.js";
import { getConsumerGrowthOverview } from "./consumerCensusService.js";
import { getRs02PlatformOverview } from "./rs02OverviewService.js";

/**
 * @param {{ period?: string }} [opts]
 */
export async function getPlatformCommandOverview({ period = "30d" } = {}) {
    const [growth, rs02, tenants, network] = await Promise.all([
        getConsumerGrowthOverview({ period }),
        getRs02PlatformOverview({ period }),
        getPlatformExecutiveOverview(),
        getNetworkStats().catch(() => null),
    ]);

    const partialNotes = [];
    if (growth.sarahAppUsers.availability === "partial") {
        partialNotes.push(`Consumer profiles capped at ${growth.sarahAppUsers.profileScanCap} documents.`);
    }
    if (rs02.subscriptions.partial) {
        partialNotes.push(`RS02 subscriptions capped at ${rs02.subscriptions.scanCap} documents.`);
    }
    if (tenants.billing?.partialNote) partialNotes.push(tenants.billing.partialNote);

    return {
        generatedAt: new Date().toISOString(),
        period,
        contractVersion: "mc-po-api-v1",
        readOnly: true,
        meta: {
            dataSource: "platform_command_facade",
            partial: partialNotes.length > 0,
            partialNotes,
        },
        growth,
        rs02,
        tenants: {
            census: tenants.tenantCensus,
            operational: tenants.tenants,
            billingSample: tenants.billing,
            integrations: tenants.integrations,
        },
        network: network
            ? {
                  entities: network.entities,
                  verification: network.verification,
                  agents: network.agents,
                  search: network.search,
              }
            : null,
        health: {
            note: "Use GET /api/platform/health for live dependency diagnostics.",
        },
    };
}
