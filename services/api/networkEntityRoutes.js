/**
 * SNET-01a — Network Identity API (v1, read-only). Auth + tenant scope: only members of the owning
 * company (or superadmin) may read an entity record. Envelope: { ok, data | error: { code, message } }.
 */
import { resolveTenantContext, assertAuthenticatedTenantMemberAccess } from "../core/tenantContext.js";
import { getEntityBySnId, getOrgEntityByCompanyId } from "../network/networkIdentityService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Request} req
 * @param {string} companyId
 */
async function assertCompanyAccess(req, companyId) {
    const ctx = await resolveTenantContext(req);
    req.tenant = { ...ctx, companyId };
    await assertAuthenticatedTenantMemberAccess(req.tenant, { auditSurface: "network_entities" });
}

/**
 * @param {import('express').Express} app
 */
export function mountNetworkEntityRoutes(app) {
    app.get("/api/network/v1/entities", async (req, res) => {
        try {
            const companyId = String(req.query?.companyId || "").trim();
            await assertCompanyAccess(req, companyId);
            const entity = await getOrgEntityByCompanyId(companyId);
            if (!entity) {
                return res.status(404).json({
                    ok: false,
                    error: { code: "ENTITY_NOT_FOUND", message: "No network entity for this company." },
                });
            }
            res.json({ ok: true, data: { entity } });
        } catch (err) {
            fail(res, err, "ENTITY_LOOKUP_FAILED");
        }
    });

    app.get("/api/network/v1/entities/:snId", async (req, res) => {
        try {
            const entity = await getEntityBySnId(req.params.snId);
            if (!entity) {
                return res.status(404).json({
                    ok: false,
                    error: { code: "ENTITY_NOT_FOUND", message: "Network entity not found." },
                });
            }
            await assertCompanyAccess(req, entity.refs?.companyId);
            res.json({ ok: true, data: { entity } });
        } catch (err) {
            fail(res, err, "ENTITY_LOOKUP_FAILED");
        }
    });
}
