/**
 * SNET-04 — durable audit of administrative decisions on the network (verification, suspension, moderation).
 * Stored in `networkAdminAudit/{auditId}`; writes are awaited (decisions must not succeed without an audit record).
 * (The generic `auditLog()` ring buffer is in-memory only — see SNET-00 §2.5 — so it is NOT used for decisions.)
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.ADMIN_AUDIT);

/**
 * @param {{ actor: string|null, action: string, snId?: string|null, companyId?: string|null, detail?: object }} input
 */
export async function recordNetworkAdminAction(input) {
    if (!input?.action) throw new Error("audit action required");
    const entry = {
        auditId: `nadm_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        at: new Date().toISOString(),
        actor: input.actor || "unknown",
        action: input.action,
        snId: input.snId || null,
        companyId: input.companyId || null,
        detail: input.detail || {},
    };
    await col.put(entry.auditId, entry, { merge: false });
    return entry;
}

/**
 * @param {{ snId?: string, action?: string, limit?: number }} [opts] newest first
 */
export async function listNetworkAdminAudit({ snId, action, limit = 100 } = {}) {
    const where = [];
    if (snId) where.push(["snId", "==", snId]);
    if (action) where.push(["action", "==", action]);
    const rows = await col.list({ where, limit: 500 });
    return rows
        .map(({ __id, ...rest }) => rest)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, limit);
}

export function clearNetworkAdminAuditForTests() {
    col.clearMemory();
}
