/**
 * In-process single-flight lock for Marketplace pack updates (companyId::packId).
 * Prevents concurrent resource mutation within one Node process.
 * Multi-process Railway replicas still rely on expectedVersion on registry commit.
 */
const inflight = new Map();

export async function withMarketplaceUpdateLock(lockKey, fn) {
    while (inflight.has(lockKey)) {
        await inflight.get(lockKey);
    }
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    inflight.set(lockKey, gate);
    try {
        return await fn();
    } finally {
        inflight.delete(lockKey);
        release();
    }
}

export function marketplaceUpdateLockKey(companyId, packId) {
    return `${companyId}::${packId}`;
}
