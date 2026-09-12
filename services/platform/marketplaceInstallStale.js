/**
 * Shared stale-installing threshold (read-only lifecycle; same semantics as registry reclaim).
 */
export const MARKETPLACE_INSTALL_STALE_MS =
    Number(process.env.MARKETPLACE_INSTALL_STALE_MS) || 15 * 60 * 1000;

export function isMarketplaceInstallStale(record) {
    if (!record || record.status !== "installing") return false;
    const t = Date.parse(record.updatedAt || record.installedAt || "");
    if (Number.isNaN(t)) return true;
    return Date.now() - t > MARKETPLACE_INSTALL_STALE_MS;
}
