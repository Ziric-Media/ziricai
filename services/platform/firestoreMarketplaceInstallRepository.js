/**
 * Firestore Marketplace install registry — companies/{companyId}/marketplaceInstalls/{packId}
 */
import crypto from "crypto";
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { TENANT_COLLECTIONS, tenantCollectionPath } from "../database/schema.js";
import { tenantDocRef } from "../database/firestoreClient.js";

import { isMarketplaceInstallStale } from "./marketplaceInstallStale.js";

function nowIso() {
    return new Date().toISOString();
}

function isStale(data) {
    return isMarketplaceInstallStale(data);
}

function docPath(companyId, packId) {
    return tenantDocRef(companyId, TENANT_COLLECTIONS.MARKETPLACE_INSTALLS, packId).__path;
}

export class FirestoreMarketplaceInstallRepository {
    async claimInstall(companyId, packId, { installedBy = "system" } = {}) {
        const db = getAdminFirestore();
        const ref = db.doc(docPath(companyId, packId));

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const existing = snap.exists ? snap.data() : null;

            if (existing?.status === "installed") {
                return { outcome: "alreadyInstalled", record: { packId, ...existing } };
            }
            if (existing?.status === "installing" && !isStale(existing)) {
                return { outcome: "inProgress", record: { packId, ...existing } };
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
            tx.set(ref, record);
            return { outcome: "claimed", record: { ...record }, installAttemptId: attemptId };
        });
    }

    async getInstall(companyId, packId) {
        const db = getAdminFirestore();
        const snap = await db.doc(docPath(companyId, packId)).get();
        if (!snap.exists) return null;
        return { packId, ...snap.data() };
    }

    async listInstalled(companyId) {
        const db = getAdminFirestore();
        const colPath = tenantCollectionPath(companyId, TENANT_COLLECTIONS.MARKETPLACE_INSTALLS);
        const snap = await db.collection(colPath).where("status", "==", "installed").get();
        return snap.docs.map((d) => ({ packId: d.id, ...d.data() }));
    }

    async listAllInstallRecords(companyId) {
        const db = getAdminFirestore();
        const colPath = tenantCollectionPath(companyId, TENANT_COLLECTIONS.MARKETPLACE_INSTALLS);
        const snap = await db.collection(colPath).get();
        return snap.docs.map((d) => ({ packId: d.id, ...d.data() }));
    }

    async completeInstall(companyId, packId, attemptId, patch) {
        const db = getAdminFirestore();
        const ref = db.doc(docPath(companyId, packId));

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error("Install record not found");
            const existing = snap.data();
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
                packId,
                companyId,
                status: "installed",
                updatedAt: ts,
                installedCompletedAt: ts,
                lastError: null,
                failedAt: null,
                installAttemptId: attemptId,
            };
            tx.set(ref, next);
            return { packId, ...next };
        });
    }

    async failInstall(companyId, packId, attemptId, lastError) {
        const db = getAdminFirestore();
        const ref = db.doc(docPath(companyId, packId));

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error("Install record not found");
            const existing = snap.data();
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
            tx.set(ref, next);
            return { packId, ...next };
        });
    }

    async updateInstalledRecord(companyId, packId, { expectedVersion, patch }) {
        const db = getAdminFirestore();
        const ref = db.doc(docPath(companyId, packId));

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error("Pack is not installed");
            const existing = snap.data();
            if (existing.status !== "installed") {
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
                packId,
                companyId,
                status: "installed",
                installedAt: existing.installedAt,
                installAttemptId: existing.installAttemptId,
                updatedAt: ts,
            };
            tx.set(ref, next);
            return { packId, ...next };
        });
    }
}
