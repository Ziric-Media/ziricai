/**
 * Read-only automotive dealership metrics — loads canonical services, aggregates via core.
 */
import { parseAutomotiveDashboardDateRange } from "./automotiveDateRange.js";
import { buildAutomotiveDashboardFromData } from "./automotiveMetricsCore.js";

export { isTestDriveAppointment } from "./automotiveAppointmentClassifier.js";
export { resolveAuthoritativeSaleDay, buildAutomotiveDashboardFromData } from "./automotiveMetricsCore.js";

/**
 * @typedef {object} AutomotiveMetricsLoaders
 * @property {(companyId: string) => Promise<object[]|null>} listVehicles
 * @property {(companyId: string) => Promise<object[]|null>} listLeads
 * @property {(companyId: string) => Promise<object[]|null>} listAppointments
 */

async function defaultLoaders() {
    const [{ listVehiclesByCompany }, { listLeads }, { listAppointments }] = await Promise.all([
        import("../inventory/inventoryService.js"),
        import("../tenants/crmService.js"),
        import("../tenants/appointmentService.js"),
    ]);
    return {
        async listVehicles(companyId) {
            try {
                return await listVehiclesByCompany(companyId);
            } catch {
                return null;
            }
        },
        async listLeads(companyId) {
            try {
                return await listLeads(companyId);
            } catch {
                return null;
            }
        },
        async listAppointments(companyId) {
            try {
                return await listAppointments(companyId, { max: 500 });
            } catch {
                return null;
            }
        },
    };
}

/**
 * @param {string} dataCompanyId
 * @param {{ from?: string, to?: string, periodDays?: string }} [query]
 * @param {number} [nowMs]
 * @param {AutomotiveMetricsLoaders|(() => Promise<AutomotiveMetricsLoaders>)} [loaders]
 */
export async function buildAutomotiveDashboardMetrics(dataCompanyId, query = {}, nowMs = Date.now(), loaders) {
    const period = parseAutomotiveDashboardDateRange(query, nowMs);
    const todayUtc = new Date(nowMs).toISOString().slice(0, 10);

    const resolvedLoaders = typeof loaders === "function" ? await loaders() : loaders || (await defaultLoaders());

    const [vehicles, leads, appointments] = await Promise.all([
        resolvedLoaders.listVehicles(dataCompanyId),
        resolvedLoaders.listLeads(dataCompanyId),
        resolvedLoaders.listAppointments(dataCompanyId),
    ]);

    return buildAutomotiveDashboardFromData({
        vehicles,
        leads,
        appointments,
        period,
        todayUtc,
        dataCompanyId,
        nowMs,
    });
}
