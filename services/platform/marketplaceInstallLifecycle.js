/**
 * Tenant Marketplace install lifecycle — read-only registry metadata (all statuses).
 */
import { getMarketplaceInstallRepository } from "./marketplaceInstallRepository.js";
import { isMarketplaceInstallStale } from "./marketplaceInstallStale.js";

const LIFECYCLE_FIELDS = [
    "packId",
    "packName",
    "status",
    "version",
    "installedAt",
    "updatedAt",
    "failedAt",
    "lastError",
    "installAttemptId",
    "installedCompletedAt",
];

function slimLifecycleItem(record) {
    const item = {};
    for (const key of LIFECYCLE_FIELDS) {
        if (record[key] !== undefined) item[key] = record[key];
    }
    if (!item.packId && record.packId) item.packId = record.packId;
    if (item.status === "installing") {
        item.installingStale = isMarketplaceInstallStale(record);
    }
    return item;
}

/**
 * @returns {Promise<{ companyId: string, items: object[], summary: object }>}
 */
export async function listMarketplaceInstallLifecycle(companyId) {
    if (!companyId) return { companyId: companyId || "", items: [], summary: { installing: 0, failed: 0, installed: 0 } };

    const repo = await getMarketplaceInstallRepository();
    const raw = await repo.listAllInstallRecords(companyId);
    const items = raw.map(slimLifecycleItem);
    const summary = { installing: 0, failed: 0, installed: 0 };
    for (const item of items) {
        if (item.status === "installing") summary.installing += 1;
        else if (item.status === "failed") summary.failed += 1;
        else if (item.status === "installed") summary.installed += 1;
    }
    return { companyId, items, summary };
}
