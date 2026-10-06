/**
 * Sarah chat authorization — independent of TENANT_SCOPE_ENFORCEMENT lax/strict.
 */
import { resolveTenantContext, assertAuthenticatedTenantMemberAccess } from "../core/tenantContext.js";
import {
    resolvePersonaFromSurface,
    resolveLandingSarahCompanyId,
    SARAH_PERSONA,
} from "./sarahPersona.js";

/**
 * Enforce Sarah-specific access before building context or invoking tools.
 *
 * @param {import('express').Request} req
 * @param {{ surface?: string, companyId?: string|null }} options
 */
export async function assertSarahChatAccess(req, options = {}) {
    const surface = String(options.surface || req.body?.surface || "portal").toLowerCase();
    const persona = resolvePersonaFromSurface(surface);
    const tenant = await resolveTenantContext(req);
    const companyId = String(
        options.companyId || req.body?.companyId || req.query?.companyId || tenant.companyId || ""
    ).trim();

    if (persona === SARAH_PERSONA.PUBLIC_RECEPTION) {
        if (surface !== "landing") {
            throw Object.assign(new Error("Public Sarah requires surface=landing"), {
                status: 400,
                code: "SARAH_SURFACE_INVALID",
            });
        }
        const allowedCompany = resolveLandingSarahCompanyId();
        if (companyId && companyId !== allowedCompany) {
            throw Object.assign(
                new Error("Public Sarah is restricted to the configured landing company scope"),
                { status: 403, code: "SARAH_PUBLIC_SCOPE_FORBIDDEN" }
            );
        }
        return { persona, companyId: companyId || allowedCompany, tenant, surface };
    }

    if (persona === SARAH_PERSONA.PLATFORM_OPERATOR) {
        if (!tenant.isSuperAdmin && !req.platformAuth) {
            throw Object.assign(new Error("Platform operator Sarah requires Mission Control access"), {
                status: 403,
                code: "SARAH_PLATFORM_FORBIDDEN",
            });
        }
        if (companyId && !tenant.isSuperAdmin && req.platformAuth?.via !== "api_key") {
            await assertAuthenticatedTenantMemberAccess({
                ...tenant,
                companyId,
            });
        }
        return { persona, companyId: companyId || null, tenant, surface };
    }

    // CLIENT_OPERATOR — portal
    if (!companyId) {
        throw Object.assign(new Error("companyId is required for portal Sarah"), {
            status: 400,
            code: "MISSING_COMPANY_ID",
        });
    }

    await assertAuthenticatedTenantMemberAccess({
        ...tenant,
        companyId,
    });

    return { persona, companyId, tenant, surface };
}
