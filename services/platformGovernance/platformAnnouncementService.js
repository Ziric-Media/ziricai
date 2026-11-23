/**
 * MC-PO-07 — ZiricAI platform announcements (draft / published).
 */
import { randomUUID } from "node:crypto";
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { recordPlatformAdminAudit } from "./platformAdminAuditService.js";

const col = createNetworkCollection(PLATFORM_GOVERNANCE.ANNOUNCEMENTS);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export async function listPlatformAnnouncements({ limit = 50 } = {}) {
    const rows = await col.list({ limit: Math.min(limit, 200) });
    return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createPlatformAnnouncement(input, actorUid) {
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (title.length < 3) throw err(422, "TITLE_REQUIRED", "Title is required.");
    if (body.length < 10) throw err(422, "BODY_REQUIRED", "Body is required.");
    const id = randomUUID();
    const now = new Date().toISOString();
    const row = {
        announcementId: id,
        title,
        body,
        type: input.type || "product",
        audience: input.audience || { scope: "all_eligible" },
        status: "draft",
        scheduledAt: input.scheduledAt || null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorUid || null,
        schemaVersion: 1,
    };
    await col.put(id, row, { merge: false });
    await recordPlatformAdminAudit({
        action: "platform_announcement.created",
        actorUid,
        targetType: "announcement",
        targetId: id,
        meta: { title, type: row.type },
    });
    return row;
}

export async function updatePlatformAnnouncement(id, input, actorUid) {
    const existing = await col.get(id);
    if (!existing) throw err(404, "NOT_FOUND", "Announcement not found.");
    const now = new Date().toISOString();
    const nextStatus = input.status ? String(input.status) : existing.status;
    const row = {
        ...existing,
        ...input,
        title: input.title !== undefined ? String(input.title).trim() : existing.title,
        body: input.body !== undefined ? String(input.body).trim() : existing.body,
        status: nextStatus,
        updatedAt: now,
        publishedAt: nextStatus === "published" ? existing.publishedAt || now : existing.publishedAt,
    };
    await col.put(id, row, { merge: false });
    await recordPlatformAdminAudit({
        action: `platform_announcement.${nextStatus}`,
        actorUid,
        targetType: "announcement",
        targetId: id,
    });
    return row;
}
