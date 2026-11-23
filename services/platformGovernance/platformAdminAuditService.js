/**
 * MC-PO-11 — durable Mission Control admin audit log.
 */
import { randomUUID } from "node:crypto";
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

const col = createNetworkCollection(PLATFORM_GOVERNANCE.ADMIN_AUDIT);

/**
 * @param {{ action: string, actorUid?: string, targetType?: string, targetId?: string, note?: string, meta?: object }} entry
 */
export async function recordPlatformAdminAudit(entry) {
    const id = randomUUID();
    const row = {
        auditId: id,
        action: String(entry.action || "unknown"),
        actorUid: entry.actorUid || "system",
        targetType: entry.targetType || null,
        targetId: entry.targetId || null,
        note: entry.note ? String(entry.note).slice(0, 2000) : null,
        meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    await col.put(id, row, { merge: false });
    return row;
}

export async function listPlatformAdminAudit({ limit = 100 } = {}) {
    const rows = await col.list({ limit: Math.min(limit, 500) });
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function clearPlatformAdminAuditForTests() {
    col.clearMemory();
}
