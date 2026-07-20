/**
 * Resolve companyId from auth/request and enforce tenant scope.
 */
import {
    resolveAuthFromRequest,
    isSuperAdminRole,
    normalizeRole,
    userBelongsToCompany,
    getTenantMembership,
    assertMfaIfRequired,
} from "../auth/authService.js";
import { auditLog } from "../audit/auditLog.js";

const ENFORCEMENT = (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase();

export function isStrictTenantEnforcement() {
    return ENFORCEMENT === "strict";
}

/**
 * Extract companyId from common request locations.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function extractCompanyId(req) {
    return (
        req.params?.companyId ||
        req.query?.companyId ||
        req.body?.companyId ||
        req.headers["x-company-id"] ||
        null
    );
}

/**
 * Build tenant context from request (auth + company scope).
 * @param {import('express').Request} req
 * @returns {Promise<{ companyId: string|null, uid: string|null, role: string|null, isSuperAdmin: boolean, email: string|null }>}
 */
export async function resolveTenantContext(req) {
    const auth = await resolveAuthFromRequest(req);
    const companyId = extractCompanyId(req);

    return {
        companyId,
        uid: auth.uid,
        role: auth.role,
        email: auth.email,
        isSuperAdmin: auth.isSuperAdmin,
        profile: auth.profile,
    };
}

/**
 * Verify the authenticated user may access the requested company.
 * @param {{ companyId: string|null, uid: string|null, role: string|null, isSuperAdmin: boolean, profile?: object }} ctx
 */
export async function assertTenantAccess(ctx) {
    if (!ctx.companyId) {
        throw Object.assign(new Error("companyId is required"), { status: 400, code: "MISSING_COMPANY_ID" });
    }

    if (ctx.isSuperAdmin) return;

    if (ENFORCEMENT === "strict") {
        if (!ctx.uid) {
            throw Object.assign(new Error("Authentication required"), { status: 401, code: "UNAUTHORIZED" });
        }

        if (!ctx.profile) {
            throw Object.assign(new Error("User profile not found — complete onboarding or contact support"), {
                status: 403,
                code: "PROFILE_REQUIRED",
            });
        }

        if (!userBelongsToCompany(ctx.profile, ctx.companyId)) {
            auditLog("cross_tenant_denied", {
                uid: ctx.uid,
                requestedCompanyId: ctx.companyId,
                profileCompanyId: ctx.profile.companyId || ctx.profile.company,
            });
            throw Object.assign(
                new Error(
                    `Cross-tenant access denied: profile company "${ctx.profile.companyId || ctx.profile.company}" does not match requested company "${ctx.companyId}"`
                ),
                { status: 403, code: "TENANT_FORBIDDEN" }
            );
        }

        const membership = await getTenantMembership(ctx.uid, ctx.companyId);
        if (!membership) {
            throw Object.assign(
                new Error(`Not a member of company "${ctx.companyId}" — membership doc missing`),
                { status: 403, code: "MEMBERSHIP_REQUIRED" }
            );
        }

        assertMfaIfRequired(ctx.profile);
    }
}

/**
 * Express middleware — attach req.tenant and enforce scope on tenant routes.
 * @param {{ optional?: boolean, requireAuth?: boolean }} [options]
 */
export function requireTenantScope(options = {}) {
    const { optional = false, requireAuth = false } = options;

    return async (req, res, next) => {
        try {
            const ctx = await resolveTenantContext(req);
            req.tenant = ctx;

            if (optional && !ctx.companyId) {
                return next();
            }

            if (requireAuth && ENFORCEMENT === "strict" && !ctx.uid && !ctx.isSuperAdmin) {
                return res.status(401).json({ error: "Authentication required" });
            }

            await assertTenantAccess(ctx);
            next();
        } catch (err) {
            const status = err.status || 403;
            res.status(status).json({
                error: err.message || "Tenant scope violation",
                code: err.code || "TENANT_ERROR",
            });
        }
    };
}

/**
 * Lightweight middleware — only attaches tenant context without enforcing.
 */
export function attachTenantContext() {
    return async (req, _res, next) => {
        try {
            req.tenant = await resolveTenantContext(req);
        } catch {
            req.tenant = { companyId: extractCompanyId(req), uid: null, role: null, isSuperAdmin: false };
        }
        next();
    };
}

export { normalizeRole, isSuperAdminRole };
