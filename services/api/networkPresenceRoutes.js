/**
 * SNET — Status posts, presence metrics, and boost (Company Portal + Sarah App consumer).
 */
import { resolveTenantContext, assertAuthenticatedTenantMemberAccess } from "../core/tenantContext.js";
import { hasPermission } from "../auth/permissionsService.js";
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { auditLog } from "../audit/auditLog.js";
import { getEntityBySnId } from "../network/networkIdentityService.js";
import {
    listStatusPostsForCompany,
    createStatusPost,
    scheduleStatusPosts,
    updateStatusPost,
    removeStatusPost,
    applyPostBoost,
    reactToStatusPost,
} from "../network/networkStatusPostService.js";
import {
    createConsumerStatusPost,
    createStatusFeedComment,
    listMergedPublicStatusFeed,
    reactToConsumerStatusPost,
} from "../network/networkConsumerStatusPostService.js";
import {
    getPresenceMetrics,
    recordProfileView,
    recordLeadInterested,
    setProfileBoostUntil,
} from "../network/networkPresenceMetricsService.js";
import { getBusinessDirectoryEntry, hydrateBusinessDirectory } from "../users/businessDirectoryService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: {
            code: err.code || fallbackCode,
            message: err.message || "Request failed",
        },
    });
}

async function authorizeTenant(req, companyId, { write = false } = {}) {
    const ctx = await resolveTenantContext(req);
    req.tenant = { ...ctx, companyId };
    await assertAuthenticatedTenantMemberAccess(req.tenant, { auditSurface: "network_presence" });
    if (write && !hasPermission(req.tenant.role, "canManageNetwork")) {
        throw Object.assign(new Error("Only owners and managers can manage Status and Discover presence."), {
            status: 403,
            code: "PERMISSION_DENIED",
        });
    }
    return req.tenant;
}

/**
 * @param {import('express').Express} app
 * @param {{ authorize?: Function, consumerGuard?: Function }} [deps]
 */
export function mountNetworkPresenceRoutes(app, deps = {}) {
    const authorize = deps.authorize || authorizeTenant;
    const consumerGuard = deps.consumerGuard || requireConsumerScope();

    const tenantRoute = (method, path, write, handler) => {
        app[method](path, async (req, res) => {
            try {
                const companyId = String(req.params.companyId || "").trim();
                const ctx = await authorize(req, companyId, { write });
                const data = await handler(companyId, req, ctx);
                res.json({ ok: true, data });
            } catch (err) {
                fail(res, err, "PRESENCE_FAILED");
            }
        });
    };

    tenantRoute("get", "/api/network/v1/orgs/:companyId/presence/metrics", false, async (companyId) => getPresenceMetrics(companyId));

    tenantRoute("get", "/api/network/v1/orgs/:companyId/status-posts", false, async (companyId) => ({
        posts: await listStatusPostsForCompany(companyId),
    }));

    tenantRoute("post", "/api/network/v1/orgs/:companyId/status-posts", true, async (companyId, req, ctx) => {
        const post = await createStatusPost(companyId, req.body || {}, ctx?.uid || null);
        auditLog("network_status_post_created", { companyId, postId: post.postId, uid: ctx?.uid || null });
        return { post };
    });

    tenantRoute("post", "/api/network/v1/orgs/:companyId/status-posts/schedule", true, async (companyId, req, ctx) => {
        const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
        const posts = await scheduleStatusPosts(companyId, slots, ctx?.uid || null);
        auditLog("network_status_posts_scheduled", { companyId, count: posts.length, uid: ctx?.uid || null });
        return { posts };
    });

    tenantRoute("patch", "/api/network/v1/orgs/:companyId/status-posts/:postId", true, async (companyId, req, ctx) => {
        const post = await updateStatusPost(companyId, req.params.postId, req.body || {});
        auditLog("network_status_post_updated", { companyId, postId: post.postId, uid: ctx?.uid || null });
        return { post };
    });

    tenantRoute("delete", "/api/network/v1/orgs/:companyId/status-posts/:postId", true, async (companyId, req, ctx) => {
        const post = await removeStatusPost(companyId, req.params.postId);
        auditLog("network_status_post_removed", { companyId, postId: post.postId, uid: ctx?.uid || null });
        return { post };
    });

    tenantRoute("post", "/api/network/v1/orgs/:companyId/status-posts/:postId/boost", true, async (companyId, req, ctx) => {
        const post = await applyPostBoost(companyId, req.params.postId, req.body || {});
        auditLog("network_status_post_boosted", { companyId, postId: post.postId, uid: ctx?.uid || null });
        return { post };
    });

    tenantRoute("post", "/api/network/v1/orgs/:companyId/presence/boost", true, async (companyId, req, ctx) => {
        const target = String(req.body?.target || "profile");
        if (target !== "profile") {
            throw Object.assign(new Error("Use status-post boost for individual posts."), { status: 400, code: "BOOST_TARGET" });
        }
        const days = Math.min(Math.max(Number(req.body?.days) || 7, 1), 30);
        const until = new Date(Date.now() + days * 86400000).toISOString();
        const metrics = await setProfileBoostUntil(companyId, until);
        auditLog("network_profile_boosted", { companyId, until, uid: ctx?.uid || null });
        return { metrics, boostUntil: until, tier: req.body?.tier || "standard" };
    });

    app.get("/api/network/v1/status-feed", consumerGuard, async (req, res) => {
        try {
            const limit = Number(req.query?.limit) || 40;
            const viewerUid = req.consumerAuth?.uid || null;
            const posts = await listMergedPublicStatusFeed({ limit, viewerUid });
            res.json({ ok: true, data: { posts } });
        } catch (err) {
            fail(res, err, "FEED_FAILED");
        }
    });

    app.post("/api/network/v1/consumer-status-posts", consumerGuard, async (req, res) => {
        try {
            const uid = req.consumerAuth?.uid;
            const post = await createConsumerStatusPost(uid, req.body || {});
            auditLog("consumer_status_post_created", { uid, postId: post.postId });
            res.status(201).json({ ok: true, data: { post } });
        } catch (err) {
            fail(res, err, "POST_FAILED");
        }
    });

    app.post("/api/network/v1/status-posts/:postId/comments", consumerGuard, async (req, res) => {
        try {
            const postId = String(req.params.postId || "");
            const uid = req.consumerAuth?.uid;
            const comment = await createStatusFeedComment(postId, uid, req.body || {});
            res.status(201).json({ ok: true, data: { comment } });
        } catch (err) {
            fail(res, err, "COMMENT_FAILED");
        }
    });

    app.post("/api/network/v1/status-posts/:postId/react", consumerGuard, async (req, res) => {
        try {
            const postId = String(req.params.postId || "");
            const uid = req.consumerAuth.uid;
            const data = postId.startsWith("csp_")
                ? await reactToConsumerStatusPost(postId, uid)
                : await reactToStatusPost(postId, uid);
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "REACT_FAILED");
        }
    });

    app.post("/api/network/v1/entities/:snId/metrics/profile-view", consumerGuard, async (req, res) => {
        try {
            await hydrateBusinessDirectory();
            const ent = await getEntityBySnId(req.params.snId);
            const companyId = ent?.refs?.companyId;
            if (!companyId) {
                return res.status(404).json({ ok: false, error: { code: "ENTITY_NOT_FOUND", message: "Entity not found." } });
            }
            const entry = getBusinessDirectoryEntry(companyId);
            if (!entry || entry.discoverability !== "public") {
                return res.status(404).json({ ok: false, error: { code: "NOT_LISTED", message: "Profile is not public." } });
            }
            const metrics = await recordProfileView(companyId);
            res.json({ ok: true, data: { metrics } });
        } catch (err) {
            fail(res, err, "METRIC_FAILED");
        }
    });

    app.post("/api/network/v1/entities/:snId/metrics/lead", consumerGuard, async (req, res) => {
        try {
            const ent = await getEntityBySnId(req.params.snId);
            const companyId = ent?.refs?.companyId;
            if (!companyId) {
                return res.status(404).json({ ok: false, error: { code: "ENTITY_NOT_FOUND", message: "Entity not found." } });
            }
            const metrics = await recordLeadInterested(companyId);
            res.json({ ok: true, data: { metrics } });
        } catch (err) {
            fail(res, err, "METRIC_FAILED");
        }
    });
}
