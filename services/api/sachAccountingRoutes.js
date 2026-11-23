/**
 * Sach Accounting — portal + consumer service request APIs.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    getClientProfile,
    listServiceRequestsForClient,
    listServiceRequestsForStaff,
    getServiceRequestForStaff,
    staffTransitionServiceRequest,
    ensureSachAccountingTenantSettings,
    listWorkflowPacksForPractice,
    getWorkflowPackDetail,
} from "../consulting/sachAccountingServiceRequestService.js";
import { SACH_CONSULT_COMPANY_ID } from "../consulting/sachAccountingConfig.js";
import { isSachAccountingTenant } from "../consulting/sachAccountingIndustryPreset.js";
import { getCompany } from "../tenants/companyService.js";
import { REQUEST_STATUSES } from "../consulting/sachAccountingConfig.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Express} app
 */
export function mountSachAccountingRoutes(app) {
    const consumerGuard = requireConsumerScope();
    const authorize = defaultAuthorize;

    app.get("/api/sach/v1/orgs/:companyId/workflow-packs", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const packs = await listWorkflowPacksForPractice(companyId);
            res.json({ ok: true, data: { packs } });
        } catch (err) {
            fail(res, err, "WORKFLOW_PACKS_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/workflow-packs/:serviceType", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const pack = await getWorkflowPackDetail(companyId, req.params.serviceType);
            res.json({ ok: true, data: { pack } });
        } catch (err) {
            fail(res, err, "WORKFLOW_PACK_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/practice-profile", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const company = await getCompany(companyId);
            if (!company || !isSachAccountingTenant(companyId, company)) {
                res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Accounting practice not found" } });
                return;
            }
            res.json({
                ok: true,
                data: {
                    companyId,
                    accountingPractice: company.settings?.accountingPractice || null,
                    serviceStatuses: REQUEST_STATUSES,
                },
            });
        } catch (err) {
            fail(res, err, "PRACTICE_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/my-service-requests", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const requests = await listServiceRequestsForClient(companyId, req.consumerAuth.uid);
            res.json({ ok: true, data: { requests } });
        } catch (err) {
            fail(res, err, "CLIENT_REQUESTS_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/my-client-profile", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const profile = await getClientProfile(companyId, req.consumerAuth.uid);
            res.json({ ok: true, data: { profile } });
        } catch (err) {
            fail(res, err, "CLIENT_PROFILE_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/service-requests", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const status = String(req.query.status || "").trim() || undefined;
            const data = await listServiceRequestsForStaff(companyId, { status });
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "STAFF_REQUESTS_READ_FAILED");
        }
    });

    app.get("/api/sach/v1/orgs/:companyId/service-requests/:requestId/staff", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const requestId = String(req.params.requestId || "").trim();
            const request = await getServiceRequestForStaff(companyId, requestId);
            res.json({ ok: true, data: { request } });
        } catch (err) {
            fail(res, err, "STAFF_REQUEST_READ_FAILED");
        }
    });

    app.post("/api/sach/v1/orgs/:companyId/service-requests/:requestId/transition", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const requestId = String(req.params.requestId || "").trim();
            const body = req.body || {};
            const request = await staffTransitionServiceRequest(companyId, requestId, ctx.uid, body);
            res.json({ ok: true, data: { request } });
        } catch (err) {
            fail(res, err, "STAFF_TRANSITION_FAILED");
        }
    });

    /** Internal bootstrap — Sach tenant only (staff write on sach-consult). */
    app.post("/api/sach/v1/orgs/:companyId/enable-practice", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: true });
            if (companyId !== SACH_CONSULT_COMPANY_ID) {
                res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Practice enable limited to Sach tenant." } });
                return;
            }
            const data = await ensureSachAccountingTenantSettings(companyId);
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "PRACTICE_ENABLE_FAILED");
        }
    });
}