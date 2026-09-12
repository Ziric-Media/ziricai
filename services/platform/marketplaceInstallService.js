/**
 * Tenant Marketplace installation registry — durable metadata ledger.
 */
import { getMarketplaceInstallRepository } from "./marketplaceInstallRepository.js";
import {
    MarketplaceInstallError,
    INSTALL_IN_PROGRESS,
    INSTALL_ATTEMPT_MISMATCH,
} from "./marketplaceInstallErrors.js";
import { resolvePackId } from "./marketplaceRegistry.js";

function resolveCanonicalPackId(packId) {
    return resolvePackId(packId);
}

export async function claimInstall(companyId, packId, { installedBy = "system" } = {}) {
    const resolved = resolveCanonicalPackId(packId);
    const repo = await getMarketplaceInstallRepository();
    const result = await repo.claimInstall(companyId, resolved, { installedBy });
    return { ...result, packId: resolved };
}

export async function getInstall(companyId, packId) {
    const resolved = resolveCanonicalPackId(packId);
    const repo = await getMarketplaceInstallRepository();
    return repo.getInstall(companyId, resolved);
}

export async function listInstalled(companyId) {
    if (!companyId) return [];
    const repo = await getMarketplaceInstallRepository();
    return repo.listInstalled(companyId);
}

export async function isInstalled(companyId, packId) {
    const rec = await getInstall(companyId, packId);
    return rec?.status === "installed";
}

export async function completeInstall(companyId, packId, attemptId, recordPatch) {
    const resolved = resolveCanonicalPackId(packId);
    const repo = await getMarketplaceInstallRepository();
    try {
        return await repo.completeInstall(companyId, resolved, attemptId, recordPatch);
    } catch (err) {
        if (err?.code === "INSTALL_ATTEMPT_MISMATCH") {
            throw new MarketplaceInstallError(INSTALL_ATTEMPT_MISMATCH, err.message);
        }
        throw err;
    }
}

export async function failInstall(companyId, packId, attemptId, lastError) {
    const resolved = resolveCanonicalPackId(packId);
    const repo = await getMarketplaceInstallRepository();
    try {
        return await repo.failInstall(companyId, resolved, attemptId, lastError);
    } catch (err) {
        if (err?.code === "INSTALL_ATTEMPT_MISMATCH") {
            throw new MarketplaceInstallError(INSTALL_ATTEMPT_MISMATCH, err.message);
        }
        throw err;
    }
}

/**
 * Update an already-installed registry record (version bumps, merge metadata).
 * Does not provision resources or change install lifecycle.
 */
export async function updateInstalledRecord(companyId, packId, { expectedVersion, patch }) {
    const resolved = resolveCanonicalPackId(packId);
    const repo = await getMarketplaceInstallRepository();
    return repo.updateInstalledRecord(companyId, resolved, { expectedVersion, patch });
}

export function assertInstallClaimResult(claimResult) {
    if (claimResult.outcome === "inProgress") {
        throw new MarketplaceInstallError(
            INSTALL_IN_PROGRESS,
            "Installation already in progress for this Industry Pack",
            { packId: claimResult.record?.packId }
        );
    }
}
