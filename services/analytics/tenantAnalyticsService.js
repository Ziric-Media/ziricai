/**
 * Tenant-scoped analytics — event bus + dashboard access.
 */
import { recordEvent, getRecentEvents } from "../analytics/analyticsService.js";
import { publish } from "../events/index.js";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { getDashboardSnapshot } from "../analytics/dashboardService.js";
import { listEvents } from "../events/eventStore.js";

class TenantAnalyticsRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.ANALYTICS);
    }
}

const analyticsRepo = new TenantAnalyticsRepo();

export async function recordTenantEvent(companyId, name, payload = {}) {
    await recordEvent(name, { ...payload, companyId });

    const adapter = await getStorageAdapter();
    if (adapter.seedAnalytics) {
        const existing = (await adapter.getAnalytics?.(companyId)) || {};
        await adapter.seedAnalytics(companyId, {
            ...existing,
            lastEvent: name,
            lastEventAt: new Date().toISOString(),
        });
    }

    return analyticsRepo.create(companyId, {
        event: name,
        payload,
        recordedAt: new Date().toISOString(),
    });
}

export async function emitTenantEvent(companyId, type, payload = {}, options = {}) {
    return publish(companyId, type, payload, options);
}

export async function getTenantMetrics(companyId) {
    const snapshot = await getDashboardSnapshot(companyId, { days: 7 });
    return snapshot.kpis;
}

export async function listTenantAnalyticsEvents(companyId, max = 50) {
    const result = await listEvents(companyId, { limit: max });
    return result.items;
}

export async function getTenantDashboard(companyId, days = 14) {
    return getDashboardSnapshot(companyId, { days });
}

export { getRecentEvents };
