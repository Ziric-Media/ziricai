/**
 * Consumer-authored Status posts (Sarah App — Facebook-style timeline).
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { getConsumerProfile } from "../users/consumerProfileService.js";
import { getUserProfile } from "../auth/authService.js";
import { getPublishedStatusPost, listPublicStatusFeed } from "./networkStatusPostService.js";

const postsCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_STATUS_POSTS);
const reactionsCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_STATUS_POST_REACTIONS);
const commentsCol = createNetworkCollection(NETWORK_COLLECTIONS.CONSUMER_STATUS_COMMENTS);
const stpReactionsCol = createNetworkCollection(NETWORK_COLLECTIONS.STATUS_POST_REACTIONS);

const MAX_BODY = 5000;
const MAX_URL = 800;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function assertMediaUrl(url, label) {
    const trimmed = String(url || "").trim().slice(0, MAX_URL);
    if (!trimmed) return null;
    if (trimmed.startsWith("/api/chat/media/") && trimmed.includes("/content?")) return trimmed;
    if (/^https?:\/\//i.test(trimmed) && trimmed.includes("/api/chat/media/") && trimmed.includes("/content?")) {
        try {
            const u = new URL(trimmed);
            return `${u.pathname}${u.search}`;
        } catch {
            throw err(400, "MEDIA_URL_INVALID", `${label} URL is not valid.`);
        }
    }
    throw err(400, "MEDIA_URL_INVALID", `${label} must be a completed chat media URL.`);
}

function normPost(doc) {
    if (!doc?.postId) return null;
    return {
        postId: doc.postId,
        publisherType: "user",
        authorUid: doc.authorUid,
        body: doc.body || "",
        imageUrl: doc.imageUrl || null,
        videoUrl: doc.videoUrl || null,
        reactions: Number(doc.reactions) || 0,
        status: doc.status || "published",
        publishedAt: doc.publishedAt || doc.createdAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt || doc.createdAt,
    };
}

async function authorPublicFields(uid) {
    const [consumer, global] = await Promise.all([getConsumerProfile(uid), getUserProfile(uid)]);
    if (!consumer) throw err(404, "CONSUMER_PROFILE_NOT_FOUND", "Sarah App profile required.");
    const name =
        String(consumer.preferredName || consumer.firstName || consumer.fullName || "Member").trim() || "Member";
    const photoURL = global?.photoURL ? String(global.photoURL) : null;
    return { authorName: name, authorPhotoUrl: photoURL };
}

/**
 * @param {string} uid
 * @param {{ body?: string, imageUrl?: string, videoUrl?: string }} input
 */
export async function createConsumerStatusPost(uid, input = {}) {
    const body = String(input?.body || "").trim().slice(0, MAX_BODY);
    const imageUrl = input?.imageUrl ? assertMediaUrl(input.imageUrl, "Image") : null;
    const videoUrl = input?.videoUrl ? assertMediaUrl(input.videoUrl, "Video") : null;
    if (!body && !imageUrl && !videoUrl) throw err(400, "POST_EMPTY", "Write something or attach media.");
    if (imageUrl && videoUrl) throw err(400, "POST_MEDIA_CONFLICT", "Attach an image or a video, not both.");
    await authorPublicFields(uid);
    const postId = `csp_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const now = new Date().toISOString();
    const doc = {
        postId,
        authorUid: uid,
        body,
        imageUrl,
        videoUrl,
        reactions: 0,
        status: "published",
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
    };
    await postsCol.put(postId, doc, { merge: false });
    return publicizeConsumerPost(normPost(doc));
}

export async function publicizeConsumerPost(post) {
    if (!post?.authorUid) return post;
    const meta = await authorPublicFields(post.authorUid);
    return { ...post, ...meta, publisherType: "user" };
}

export async function listConsumerPostsForPublicFeed({ limit = 40 } = {}) {
    const max = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const rows = await postsCol.list({ limit: 500 });
    const published = rows
        .map(normPost)
        .filter((p) => p && p.status === "published")
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, max);

    const authorCache = new Map();
    const out = [];
    for (const p of published) {
        let meta = authorCache.get(p.authorUid);
        if (!meta) {
            meta = await authorPublicFields(p.authorUid).catch(() => ({
                authorName: "Member",
                authorPhotoUrl: null,
            }));
            authorCache.set(p.authorUid, meta);
        }
        out.push({ ...p, ...meta });
    }
    return out;
}

async function viewerReactedPostIds(uid, postIds = []) {
    const reacted = new Set();
    if (!uid || !postIds.length) return reacted;
    await Promise.all(
        postIds.map(async (postId) => {
            const reactionId = `${postId}__${uid}`;
            if (postId.startsWith("csp_")) {
                if (await reactionsCol.get(reactionId)) reacted.add(postId);
            } else if (postId.startsWith("stp_")) {
                if (await stpReactionsCol.get(reactionId)) reacted.add(postId);
            }
        })
    );
    return reacted;
}

async function commentBundlesForPosts(postIds = [], { previewLimit = 4 } = {}) {
    /** @type {Map<string, { count: number, preview: object[] }>} */
    const map = new Map();
    for (const postId of postIds) {
        map.set(postId, { count: 0, preview: [] });
    }
    if (!postIds.length) return map;
    const idSet = new Set(postIds);
    const rows = await commentsCol.list({ limit: 2000 });
    const sorted = rows
        .filter((r) => r?.postId && idSet.has(r.postId))
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const authorCache = new Map();
    for (const row of sorted) {
        const pack = map.get(row.postId);
        if (!pack) continue;
        pack.count += 1;
        if (pack.preview.length >= previewLimit) continue;
        let meta = authorCache.get(row.authorUid);
        if (!meta && row.authorUid) {
            meta = await authorPublicFields(row.authorUid).catch(() => ({
                authorName: "Member",
                authorPhotoUrl: null,
            }));
            authorCache.set(row.authorUid, meta);
        }
        pack.preview.push({
            commentId: row.commentId,
            postId: row.postId,
            body: row.body || "",
            parentCommentId: row.parentCommentId || null,
            createdAt: row.createdAt,
            authorName: meta?.authorName || "Member",
            authorPhotoUrl: meta?.authorPhotoUrl || null,
        });
    }
    return map;
}

async function assertPublishedFeedPost(postId) {
    if (postId.startsWith("csp_")) {
        const doc = await postsCol.get(postId);
        if (!doc || doc.status !== "published") throw err(404, "POST_NOT_FOUND", "Post not found.");
        return;
    }
    if (postId.startsWith("stp_")) {
        const doc = await getPublishedStatusPost(postId);
        if (!doc) throw err(404, "POST_NOT_FOUND", "Post not found.");
        return;
    }
    throw err(400, "POST_ID_INVALID", "Unknown post.");
}

/**
 * @param {string} postId
 * @param {string} uid
 * @param {{ body?: string, parentCommentId?: string }} input
 */
export async function createStatusFeedComment(postId, uid, input = {}) {
    const body = String(input?.body || "").trim().slice(0, 500);
    if (!body) throw err(400, "COMMENT_EMPTY", "Write a comment.");
    const parentCommentId = input?.parentCommentId ? String(input.parentCommentId).trim() : null;
    await assertPublishedFeedPost(postId);
    const meta = await authorPublicFields(uid);
    const commentId = `csc_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const now = new Date().toISOString();
    const doc = {
        commentId,
        postId,
        authorUid: uid,
        body,
        parentCommentId,
        createdAt: now,
    };
    await commentsCol.put(commentId, doc, { merge: false });
    return {
        commentId,
        postId,
        body,
        parentCommentId,
        createdAt: now,
        authorName: meta.authorName,
        authorPhotoUrl: meta.authorPhotoUrl,
    };
}

/** Merged company + consumer feed for GET /status-feed */
export async function listMergedPublicStatusFeed({ limit = 40, viewerUid = null } = {}) {
    const max = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const [companyPosts, consumerPosts] = await Promise.all([
        listPublicStatusFeed({ limit: max }),
        listConsumerPostsForPublicFeed({ limit: max }),
    ]);
    const companyCards = companyPosts.map((p) => ({
        ...p,
        publisherType: "company",
        sortAt: p.publishedAt || p.createdAt,
    }));
    const consumerCards = consumerPosts.map((p) => ({
        ...p,
        sortAt: p.publishedAt || p.createdAt,
    }));
    const merged = [...companyCards, ...consumerCards]
        .sort((a, b) => String(b.sortAt || "").localeCompare(String(a.sortAt || "")))
        .slice(0, max);
    const postIds = merged.map((p) => p.postId).filter(Boolean);
    const [reacted, commentMap] = await Promise.all([
        viewerReactedPostIds(viewerUid, postIds),
        commentBundlesForPosts(postIds, { previewLimit: 4 }),
    ]);
    return merged.map((p) => {
        const comments = commentMap.get(p.postId) || { count: 0, preview: [] };
        return {
            ...p,
            viewerReacted: reacted.has(p.postId),
            commentCount: comments.count,
            previewComments: comments.preview,
        };
    });
}

/**
 * Idempotent like — one reaction per user per post.
 * @param {string} postId
 * @param {string} uid
 */
export async function reactToConsumerStatusPost(postId, uid) {
    const doc = await postsCol.get(postId);
    if (!doc || doc.status !== "published") throw err(404, "POST_NOT_FOUND", "Post not found.");
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
    return { reactions: next.reactions, postId, alreadyReacted: false };
}

export function clearConsumerStatusPostsForTests() {
    postsCol.clearMemory();
    reactionsCol.clearMemory();
    commentsCol.clearMemory();
}
