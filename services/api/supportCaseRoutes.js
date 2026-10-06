/**
 * MC-U-4C — Tenant SupportCase API routes.
 */
import { requireTenantScope, requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import {
    listSupportCasesPage,
    getSupportCase,
    createSupportCase,
    patchSupportCase,
    recordSupportDiagnosis,
    appendRemediationAttempt,
    escalateSupportCase,
    resolveSupportCaseWithVerification,
    canPatchSupportCase,
} from "../tenants/supportCaseService.js";

function requireSupportOperator(req, res, next) {
    if (canPatchSupportCase(req.tenant) || req.tenant?.isSuperAdmin) {
        return next();
    }
    return res.status(403).json({
        error: "Only owner, manager, or support roles may run support operations",
        code: "SUPPORT_OPS_FORBIDDEN",
    });
}

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

    app.post(
        "/api/companies/:companyId/support/cases/:caseId/diagnosis",
        requireAuthenticatedTenantMember(),
        requireSupportOperator,
        async (req, res) => {
            try {
                const supportCase = await recordSupportDiagnosis(
                    req.params.companyId,
                    req.params.caseId,
                    req.body || {},
                    req.tenant
                );
                res.json({ supportCase, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to record diagnosis", code: err.code });
            }
        }
    );

    app.post(
        "/api/companies/:companyId/support/cases/:caseId/remediation-attempts",
        requireAuthenticatedTenantMember(),
        requireSupportOperator,
        async (req, res) => {
            try {
                const result = await appendRemediationAttempt(
                    req.params.companyId,
                    req.params.caseId,
                    req.body || {},
                    req.tenant
                );
                res.json({ ...result, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to record remediation", code: err.code });
            }
        }
    );

    app.post(
        "/api/companies/:companyId/support/cases/:caseId/escalate",
        requireAuthenticatedTenantMember(),
        requireSupportOperator,
        async (req, res) => {
            try {
                const supportCase = await escalateSupportCase(
                    req.params.companyId,
                    req.params.caseId,
                    req.body || {},
                    req.tenant
                );
                res.json({ supportCase, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to escalate support case", code: err.code });
            }
        }
    );

    app.post(
        "/api/companies/:companyId/support/cases/:caseId/resolve",
        requireAuthenticatedTenantMember(),
        requireSupportOperator,
        async (req, res) => {
            try {
                const supportCase = await resolveSupportCaseWithVerification(
                    req.params.companyId,
                    req.params.caseId,
                    req.body || {},
                    req.tenant
                );
                res.json({ supportCase, companyId: req.params.companyId });
            } catch (err) {
                const status = err.status || 500;
                res.status(status).json({ error: err.message || "Failed to resolve support case", code: err.code });
            }
        }
    );
}
