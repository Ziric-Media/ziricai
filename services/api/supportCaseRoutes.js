/**
 * MC-U-4C — Tenant SupportCase API routes.
 */
import { requireTenantScope, requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import {
    listSupportCasesPage,
    getSupportCase,
    createSupportCase,
    patchSupportCase,
} from "../tenants/supportCaseService.js";

export function mountSupportCaseRoutes(app) {
    app.get("/api/companies/:companyId/support/cases", requireTenantScope(), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const limit = req.query.limit ? Number(req.query.limit) : 50;
            const result = await listSupportCasesPage(companyId, {
                status: req.query.status,
                priority: req.query.priority,
                category: req.query.category,
                assigneeId: req.query.assigneeId,
                limit: Number.isFinite(limit) ? limit : 50,
                cursor: req.query.cursor || null,
            });
            res.json(result);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Failed to list support cases", code: err.code });
        }
    });

    app.get("/api/companies/:companyId/support/cases/:caseId", requireTenantScope(), async (req, res) => {
        try {
            const supportCase = await getSupportCase(req.params.companyId, req.params.caseId);
            res.json({ supportCase, companyId: req.params.companyId });
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Failed to load support case", code: err.code });
        }
    });

    app.post(
        "/api/companies/:companyId/support/cases",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const supportCase = await createSupportCase(req.params.companyId, req.body || {}, req.tenant);
                res.status(201).json({ supportCase, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to create support case", code: err.code });
            }
        }
    );

    app.patch(
        "/api/companies/:companyId/support/cases/:caseId",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const supportCase = await patchSupportCase(
                    req.params.companyId,
                    req.params.caseId,
                    req.body || {},
                    req.tenant
                );
                res.json({ supportCase, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to update support case", code: err.code });
            }
        }
    );
}
