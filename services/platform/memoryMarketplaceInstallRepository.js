/**
 * In-process Marketplace install registry with serialized claims per companyId::packId.
 */
import crypto from "crypto";
import { isMarketplaceInstallStale } from "./marketplaceInstallStale.js";

function key(companyId, packId) {
    return `${companyId}::${packId}`;
}

function nowIso() {
    return new Date().toISOString();
}

function isStale(record) {
    return isMarketplaceInstallStale(record);
}

export class MemoryMarketplaceInstallRepository {
    constructor() {
        /** @type {Map<string, object>} */
        this.docs = new Map();
        /** @type {Map<string, Promise<void>>} */
        this.locks = new Map();
    }

    async _withLock(lockKey, fn) {
        while (this.locks.has(lockKey)) {
            await this.locks.get(lockKey);
        }
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        this.locks.set(lockKey, gate);
        try {
            return await fn();
        } finally {
            this.locks.delete(lockKey);
            release();
        }
    }

    async claimInstall(companyId, packId, { installedBy = "system" } = {}) {
        const lockKey = key(companyId, packId);
        return this._withLock(lockKey, async () => {
            const existing = this.docs.get(lockKey) || null;
            if (existing?.status === "installed") {
                return { outcome: "alreadyInstalled", record: { ...existing } };
            }
            if (existing?.status === "installing" && !isStale(existing)) {
                return { outcome: "inProgress", record: { ...existing } };
            }
            const attemptId = crypto.randomUUID();
            const ts = nowIso();
            const record = {
                packId,
                packName: existing?.packName || packId,
                category: existing?.category || "",
                companyId,
                version: existing?.version || "0.0.0",
                status: "installing",
                installedAt: existing?.installedAt || ts,
                updatedAt: ts,
                installedBy: installedBy || "system",
                installAttemptId: attemptId,
                customizations: existing?.customizations || {},
                enabledIntegrations: existing?.enabledIntegrations || [],
                disabledIntegrations: existing?.disabledIntegrations || [],
                agentIds: [],
                knowledgeDocIds: [],
                workflowIds: [],
                reportIds: [],
                mergedKnowledgeTitles: existing?.mergedKnowledgeTitles || [],
                mergedWorkflowNames: existing?.mergedWorkflowNames || [],
                links: existing?.links || {},
                lastError: null,
                failedAt: null,
                installedCompletedAt: null,
            };
            this.docs.set(lockKey, record);
            return { outcome: "claimed", record: { ...record }, installAttemptId: attemptId };
        });
    }

    async getInstall(companyId, packId) {
        const rec = this.docs.get(key(companyId, packId));
        return rec ? { ...rec } : null;
    }

    async listInstalled(companyId) {
        const prefix = `${companyId}::`;
        const items = [];
        for (const [k, rec] of this.docs.entries()) {
            if (k.startsWith(prefix) && rec.status === "installed") {
                items.push({ ...rec });
            }
        }
        return items;
    }

    async listAllInstallRecords(companyId) {
        const prefix = `${companyId}::`;
        const items = [];
        for (const [k, rec] of this.docs.entries()) {
            if (k.startsWith(prefix)) {
                items.push({ ...rec });
            }
        }
        return items;
    }

    async completeInstall(companyId, packId, attemptId, patch) {
        const lockKey = key(companyId, packId);
        return this._withLock(lockKey, async () => {
            const existing = this.docs.get(lockKey);
            if (!existing) throw new Error("Install record not found");
            if (existing.installAttemptId !== attemptId) {
                const err = new Error("Install attempt mismatch");
                err.code = "INSTALL_ATTEMPT_MISMATCH";
                throw err;
            }
            if (existing.status !== "installing") {
                throw new Error(`Cannot complete install from status ${existing.status}`);
            }
            const ts = nowIso();
            const next = {
                ...existing,
                ...patch,
                status: "installed",
                updatedAt: ts,
                installedCompletedAt: ts,
                lastError: null,
                failedAt: null,
                installAttemptId: attemptId,
            };
            this.docs.set(lockKey, next);
            return { ...next };
        });
    }

    async failInstall(companyId, packId, attemptId, lastError) {
        const lockKey = key(companyId, packId);
        return this._withLock(lockKey, async () => {
            const existing = this.docs.get(lockKey);
            if (!existing) throw new Error("Install record not found");
            if (existing.installAttemptId !== attemptId) {
                const err = new Error("Install attempt mismatch");
                err.code = "INSTALL_ATTEMPT_MISMATCH";
                throw err;
            }
            const ts = nowIso();
            const next = {
                ...existing,
                status: "failed",
                updatedAt: ts,
                failedAt: ts,
                lastError: lastError || "Installation failed",
            };
            this.docs.set(lockKey, next);
            return { ...next };
        });
    }

    async updateInstalledRecord(companyId, packId, { expectedVersion, patch }) {
        const lockKey = key(companyId, packId);
        return this._withLock(lockKey, async () => {
            const existing = this.docs.get(lockKey);
            if (!existing || existing.status !== "installed") {
                throw new Error("Pack is not installed");
            }
            if (expectedVersion != null && existing.version !== expectedVersion) {
                throw new Error(
                    `Version mismatch: expected ${expectedVersion}, found ${existing.version}`
                );
            }
            const ts = nowIso();
            const { installedAt, status, installAttemptId, ...restPatch } = patch || {};
            const next = {
                ...existing,
                ...restPatch,
                status: "installed",
                installedAt: existing.installedAt,
                installAttemptId: existing.installAttemptId,
                updatedAt: ts,
            };
            this.docs.set(lockKey, next);
            return { ...next };
        });
    }
}
