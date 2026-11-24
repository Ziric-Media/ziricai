/**
 * Company Portal → Sarah App Status posts (tenant-published feed items).
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { recordPostReaction } from "./networkPresenceMetricsService.js";
import { getBusinessDirectoryEntry, hydrateBusinessDirectory } from "../users/businessDirectoryService.js";

const postsCol = createNetworkCollection(NETWORK_COLLECTIONS.STATUS_POSTS);
const reactionsCol = createNetworkCollection(NETWORK_COLLECTIONS.STATUS_POST_REACTIONS);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function normPost(doc) {
    if (!doc?.postId) return null;
    return {
        postId: doc.postId,
        companyId: doc.companyId,
        body: doc.body || "",
        imageUrl: doc.imageUrl || null,
        videoUrl: doc.videoUrl || null,
        reactions: Number(doc.reactions) || 0,
        boostUntil: doc.boostUntil || null,
        boostTier: doc.boostTier || null,
        status: doc.status || "published",
        scheduledAt: doc.scheduledAt || null,
        publishedAt: doc.publishedAt || null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt || doc.createdAt,
        createdBy: doc.createdBy || null,
    };
}

function parseScheduleAt(value) {
    if (!value) return null;
    const t = new Date(value);
    if (Number.isNaN(t.getTime())) throw err(400, "SCHEDULE_INVALID", "scheduledAt must be a valid ISO date-time.");
    return t.toISOString();
}

function isBoosted(p) {
    return p.boostUntil && new Date(p.boostUntil).getTime() > Date.now();
}

export async function listStatusPostsForCompany(companyId, { includeRemoved = false } = {}) {
    await publishDueScheduledPosts();
    const rows = await postsCol.list({ where: [["companyId", "==", companyId]], limit: 200 });
    return rows
        .map(normPost)
        .filter(Boolean)
        .filter((p) => includeRemoved || p.status !== "removed")
        .sort((a, b) => {
            const ka = a.status === "scheduled" ? a.scheduledAt : a.publishedAt || a.createdAt;
            const kb = b.status === "scheduled" ? b.scheduledAt : b.publishedAt || b.createdAt;
            return String(kb || "").localeCompare(String(ka || ""));
        });
}

async function putPostDoc(companyId, input, actorUid = null, { forceScheduled = false } = {}) {
    const body = String(input?.body || "").trim();
    const imageUrl = input?.imageUrl ? String(input.imageUrl).slice(0, 500) : null;
    const videoUrl = input?.videoUrl ? String(input.videoUrl).slice(0, 500) : null;
    if (!body && !imageUrl && !videoUrl) throw err(400, "POST_EMPTY", "Write something or attach media.");
    const postId = `stp_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const now = new Date().toISOString();
    const scheduledAt = parseScheduleAt(input?.scheduledAt);
    const scheduleFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;
    const isScheduled = forceScheduled || scheduleFuture;
    if (isScheduled && !scheduledAt) throw err(400, "SCHEDULE_REQUIRED", "scheduledAt is required for scheduled posts.");
    const maxAhead = Date.now() + 90 * 86400000;
    if (isScheduled && new Date(scheduledAt).getTime() > maxAhead) {
        throw err(400, "SCHEDULE_TOO_FAR", "Schedule within the next 90 days.");
    }
    const doc = {
        postId,
        companyId,
        body,
        imageUrl,
        videoUrl,
        reactions: 0,
        boostUntil: null,
        boostTier: null,
        status: isScheduled ? "scheduled" : "published",
        scheduledAt: isScheduled ? scheduledAt : null,
        publishedAt: isScheduled ? null : now,
        createdAt: now,
        updatedAt: now,
        createdBy: actorUid,
    };
    await postsCol.put(postId, doc, { merge: false });
    return normPost(doc);
}

export async function createStatusPost(companyId, input, actorUid = null) {
    return putPostDoc(companyId, input, actorUid);
}

/**
 * Schedule multiple posts (e.g. a week of Status updates). Empty slots are skipped.
 * @param {string} companyId
 * @param {object[]} slots
 */
export async function scheduleStatusPosts(companyId, slots = [], actorUid = null) {
    if (!Array.isArray(slots) || !slots.length) throw err(400, "SLOTS_REQUIRED", "Add at least one scheduled slot.");
    if (slots.length > 14) throw err(400, "SLOTS_LIMIT", "At most 14 slots per request.");
    const created = [];
    for (const slot of slots) {
        const scheduledAt = parseScheduleAt(slot?.scheduledAt);
        if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
            throw err(400, "SCHEDULE_INVALID", "Each slot needs a future scheduledAt.");
        }
        const post = await putPostDoc(companyId, { ...slot, scheduledAt }, actorUid, { forceScheduled: true });
        created.push(post);
    }
    return created;
}

/** Promote due scheduled posts to published (invoke on feed read and tenant list). */
export async function publishDueScheduledPosts() {
    const rows = await postsCol.list({ where: [["status", "==", "scheduled"]], limit: 200 });
    const now = Date.now();
    let promoted = 0;
    for (const doc of rows) {
        if (!doc?.scheduledAt) continue;
        if (new Date(doc.scheduledAt).getTime() > now) continue;
        const next = {
            ...doc,
            status: "published",
            publishedAt: doc.scheduledAt,
            updatedAt: new Date().toISOString(),
        };
        await postsCol.put(doc.postId, next, { merge: false });
        promoted += 1;
    }
    return promoted;
}

export async function updateStatusPost(companyId, postId, patch = {}) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.companyId !== companyId) throw err(404, "POST_NOT_FOUND", "Post not found.");
    if (doc.status === "removed") throw err(410, "POST_REMOVED", "Post was removed.");
    const next = { ...doc, updatedAt: new Date().toISOString() };
    if (patch.body !== undefined) next.body = String(patch.body || "").trim();
    if (patch.imageUrl !== undefined) next.imageUrl = patch.imageUrl ? String(patch.imageUrl).slice(0, 500) : null;
    if (patch.videoUrl !== undefined) next.videoUrl = patch.videoUrl ? String(patch.videoUrl).slice(0, 500) : null;
    await postsCol.put(postId, next, { merge: false });
    return normPost(next);
}

export async function removeStatusPost(companyId, postId) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.companyId !== companyId) throw err(404, "POST_NOT_FOUND", "Post not found.");
    const next = { ...doc, status: "removed", updatedAt: new Date().toISOString() };
    await postsCol.put(postId, next, { merge: false });
    return normPost(next);
}

export async function applyPostBoost(companyId, postId, { tier = "standard", days = 7 } = {}) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.companyId !== companyId) throw err(404, "POST_NOT_FOUND", "Post not found.");
    const d = Math.min(Math.max(Number(days) || 7, 1), 30);
    const until = new Date(Date.now() + d * 86400000).toISOString();
    const next = { ...doc, boostTier: String(tier).slice(0, 20), boostUntil: until, updatedAt: new Date().toISOString() };
    await postsCol.put(postId, next, { merge: false });
    return normPost(next);
}

export async function getPublishedStatusPost(postId) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.status !== "published") return null;
    return normPost(doc);
}

export async function listPublicStatusFeed({ limit = 40 } = {}) {
    await publishDueScheduledPosts();
    await hydrateBusinessDirectory();
    const max = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const rows = await postsCol.list({ limit: 500 });
    const published = rows
        .map(normPost)
        .filter((p) => p && p.status === "published")
        .filter((p) => {
            const ent = getBusinessDirectoryEntry(p.companyId);
            return ent && ent.discoverability === "public";
        });
    published.sort((a, b) => {
        const ba = isBoosted(a) ? 1 : 0;
        const bb = isBoosted(b) ? 1 : 0;
        if (bb !== ba) return bb - ba;
        return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return published.slice(0, max).map((p) => {
        const ent = getBusinessDirectoryEntry(p.companyId);
        return {
            ...p,
            companyName: ent?.displayName || p.companyId,
            logoUrl: ent?.logoUrl || null,
            boosted: isBoosted(p),
        };
    });
}

/**
 * Idempotent like when uid is provided (one reaction per user per post).
 * @param {string} postId
 * @param {string} [uid]
 */
export async function reactToStatusPost(postId, uid = null) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.status !== "published") throw err(404, "POST_NOT_FOUND", "Post not found.");
    if (uid) {
        const reactionId = `${postId}__${uid}`;
        const existing = await reactionsCol.get(reactionId);
        if (existing) {
            return { reactions: Number(doc.reactions) || 0, postId, alreadyReacted: true };
        }
        const now = new Date().toISOString();
        await reactionsCol.put(
            reactionId,
            { reactionId, postId, uid, createdAt: now },
            { merge: false }
        );
        const next = { ...doc, reactions: (Number(doc.reactions) || 0) + 1, updatedAt: now };
        await postsCol.put(postId, next, { merge: false });
        await recordPostReaction(doc.companyId, postId);
        return { reactions: next.reactions, postId, alreadyReacted: false };
    }
    const next = { ...doc, reactions: (Number(doc.reactions) || 0) + 1, updatedAt: new Date().toISOString() };
    await postsCol.put(postId, next, { merge: false });
    await recordPostReaction(doc.companyId, postId);
    return { reactions: next.reactions, postId };
}

export function clearStatusPostReactionsForTests() {
    reactionsCol.clearMemory();
}

export function seedStatusPostForTests(doc) {
    const full = {
        reactions: 0,
        status: "published",
        companyId: doc.companyId,
        createdAt: new Date().toISOString(),
        ...doc,
    };
    return postsCol.put(full.postId, full, { merge: false });
}

export function clearStatusPostsForTests() {
    postsCol.clearMemory();
    reactionsCol.clearMemory();
}
