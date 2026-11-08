/**
 * SNET-03 — Network profile API (v1).
 *   Tenant (member of the company; writes need owner/manager):
 *     GET  /api/network/v1/orgs/:companyId/listing
 *     PUT  /api/network/v1/orgs/:companyId/listing            (save draft)
 *     POST /api/network/v1/orgs/:companyId/listing/publish
 *     POST /api/network/v1/orgs/:companyId/listing/unpublish
 *   Consumer (Sarah App, verified profile):
 *     GET  /api/network/v1/entities/:snId/profile             (public profile of a listed entity)
 * Envelope: { ok, data | error: { code, message } }.
 */
import { resolveTenantContext, assertAuthenticatedTenantMemberAccess } from "../core/tenantContext.js";
import { hasPermission } from "../auth/permissionsService.js";
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { auditLog } from "../audit/auditLog.js";
import { DISCOVER_CATEGORIES } from "../network/networkTaxonomy.js";
import {
    getListing,
    saveListingDraft,
    publishListing,
    unpublishListing,
    getPublicProfileBySnId,
} from "../network/networkProfileService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: {
            code: err.code || fallbackCode,
            message: err.message || "Request failed",
            ...(err.missing ? { missing: err.missing } : {}),
            ...(err.fields ? { fields: err.fields } : {}),
        },
    });
}

/** Default tenant authorization: authenticated member of the company; mutations need owner/manager (or superadmin). */
export async function defaultAuthorize(req, companyId, { write = false } = {}) {
    const ctx = await resolveTenantContext(req);
    req.tenant = { ...ctx, companyId };
    await assertAuthenticatedTenantMemberAccess(req.tenant, { auditSurface: "network_listing" });
    if (write && !hasPermission(req.tenant.role, "canManageNetwork")) {
        throw Object.assign(new Error("Only owners and managers can change the Sarah Network listing."), {
            status: 403,
            code: "PERMISSION_DENIED",
        });
    }
    return req.tenant;
}

/**
 * @param {import('express').Express} app
 * @param {{ authorize?: Function, consumerGuard?: Function, listingDeps?: object }} [deps] test seams
 */
export function mountNetworkListingRoutes(app, deps = {}) {
    const authorize = deps.authorize || defaultAuthorize;
    const consumerGuard = deps.consumerGuard || requireConsumerScope();
    const listingDeps = deps.listingDeps || {};

    const tenantRoute = (method, path, write, handler) => {
        app[method](path, async (req, res) => {
            try {
                const companyId = String(req.params.companyId || "").trim();
                const ctx = await authorize(req, companyId, { write });
                const data = await handler(companyId, req, ctx);
                res.json({ ok: true, data });
            } catch (err) {
                fail(res, err, "LISTING_FAILED");
            }
        });
    };

    tenantRoute("get", "/api/network/v1/orgs/:companyId/listing", false, async (companyId, _req, ctx) => ({
        ...(await getListing(companyId, listingDeps)),
        // Lets the Company Portal editor offer the real taxonomy without hard-coding drift, and show read-only for non-managers.
        categoryOptions: DISCOVER_CATEGORIES.map(({ id, label }) => ({ id, label })),
        canEdit: Boolean(ctx?.role) && hasPermission(ctx.role, "canManageNetwork"),
    }));

    tenantRoute("put", "/api/network/v1/orgs/:companyId/listing", true, async (companyId, req, ctx) => {
        const result = await saveListingDraft(companyId, req.body || {}, ctx?.uid || null, listingDeps);
        auditLog("network_listing_draft_saved", { companyId, uid: ctx?.uid || null });
        return result;
    });

    tenantRoute("post", "/api/network/v1/orgs/:companyId/listing/publish", true, async (companyId, _req, ctx) => {
        const result = await publishListing(companyId, ctx?.uid || null, listingDeps);
        auditLog("network_listing_published", { companyId, uid: ctx?.uid || null, snId: result.snId });
        return result;
    });

    tenantRoute("post", "/api/network/v1/orgs/:companyId/listing/unpublish", true, async (companyId, _req, ctx) => {
        const result = await unpublishListing(companyId, ctx?.uid || null, listingDeps);
        auditLog("network_listing_unpublished", { companyId, uid: ctx?.uid || null, snId: result.snId });
        return result;
    });

    app.get("/api/network/v1/entities/:snId/profile", consumerGuard, async (req, res) => {
        try {
            const profile = await getPublicProfileBySnId(req.params.snId);
            if (!profile) {
                return res.status(404).json({
                    ok: false,
                    error: { code: "ENTITY_NOT_FOUND", message: "No public profile for this entity." },
                });
            }
            res.json({ ok: true, data: { profile } });
        } catch (err) {
            fail(res, err, "PROFILE_FAILED");
        }
    });
}
