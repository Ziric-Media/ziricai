/**
 * EDU-03 / EDU-04 — school guardian APIs.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    submitGuardianApplication,
    listGuardianLinksForSchool,
    listGuardianLinksForParent,
    decideGuardianLink,
} from "../education/schoolGuardianService.js";
import {
    createAdmissionDraft,
    updateAdmissionDraft,
    registerAdmissionDocument,
    submitAdmissionApplication,
    withdrawAdmissionApplication,
    listAdmissionsForParent,
    getAdmissionForParent,
    listAdmissionsForSchool,
    getAdmissionForSchool,
    staffTransitionAdmission,
    staffRecordAdmissionDecision,
    staffUpdateAdmissionDocument,
} from "../education/schoolAdmissionService.js";
import { ADMISSION_PRIVACY_NOTICE_VERSION } from "../education/educareAdmissionConfig.js";
import { getCompany, updateCompany } from "../tenants/companyService.js";
import { EDUCARE_CAMPUSES } from "../education/educareDefaults.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Express} app
 */
export function mountEducationRoutes(app) {
    const consumerGuard = requireConsumerScope();
    const authorize = defaultAuthorize;

    app.get("/api/education/v1/orgs/:companyId/campuses", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const company = await getCompany(companyId);
            if (!company) {
                res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "School not found" } });
                return;
            }
            const campuses =
                company.campuses || company.settings?.campuses || company.settings?.campusesPublic || [];
            res.json({ ok: true, data: { campuses, education: company.settings?.education || null } });
        } catch (err) {
            fail(res, err, "CAMPUSES_READ_FAILED");
        }
    });

    app.get("/api/education/v1/orgs/:companyId/my-guardian-links", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const links = await listGuardianLinksForParent(companyId, req.consumerAuth.uid);
            res.json({ ok: true, data: { links } });
        } catch (err) {
            fail(res, err, "GUARDIAN_LINKS_READ_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/guardian-application", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const body = req.body || {};
            const result = await submitGuardianApplication(companyId, req.consumerAuth.uid, body);
            res.status(201).json({ ok: true, data: result });
        } catch (err) {
            fail(res, err, "GUARDIAN_APPLICATION_FAILED");
        }
    });

    app.get("/api/education/v1/orgs/:companyId/guardian-links", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: false });
            const status = String(req.query.status || "").trim();
            const links = await listGuardianLinksForSchool(companyId, { status, limit: req.query.limit });
            res.json({ ok: true, data: { links, companyId: ctx.companyId } });
        } catch (err) {
            fail(res, err, "GUARDIAN_QUEUE_READ_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/guardian-links/:linkId/:action", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const linkId = String(req.params.linkId || "").trim();
            const action = String(req.params.action || "").trim();
            const actorUid = ctx.uid || req.auth?.uid || "staff";
            const result = await decideGuardianLink(companyId, linkId, action, actorUid, {
                reason: req.body?.reason,
            });
            res.json({ ok: true, data: result });
        } catch (err) {
            fail(res, err, "GUARDIAN_DECISION_FAILED");
        }
    });

    app.get("/api/education/v1/educare/campus-catalog", async (_req, res) => {
        res.json({ ok: true, data: { campuses: EDUCARE_CAMPUSES } });
    });

    app.get("/api/education/v1/admissions/privacy-notice", async (_req, res) => {
        res.json({
            ok: true,
            data: {
                version: ADMISSION_PRIVACY_NOTICE_VERSION,
                summary:
                    "Educare collects learner and guardian information only to process school applications. Data is used for admission review, contact, and lawful school administration. Full POPIA notice requires school management approval.",
            },
        });
    });

  // —— Stage 3: parent / guardian admission applications ——

    app.get("/api/education/v1/orgs/:companyId/my-admission-applications", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const apps = await listAdmissionsForParent(companyId, req.consumerAuth.uid);
            res.json({ ok: true, data: { applications: apps } });
        } catch (err) {
            fail(res, err, "ADMISSION_LIST_FAILED");
        }
    });

    app.get("/api/education/v1/orgs/:companyId/admission-applications/:applicationId", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const applicationId = String(req.params.applicationId || "").trim();
            const app = await getAdmissionForParent(companyId, req.consumerAuth.uid, applicationId);
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_READ_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const app = await createAdmissionDraft(companyId, req.consumerAuth.uid, req.body || {});
            res.status(201).json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_CREATE_FAILED");
        }
    });

    app.patch("/api/education/v1/orgs/:companyId/admission-applications/:applicationId", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const applicationId = String(req.params.applicationId || "").trim();
            const app = await updateAdmissionDraft(companyId, req.consumerAuth.uid, applicationId, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_UPDATE_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/documents", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const applicationId = String(req.params.applicationId || "").trim();
            const app = await registerAdmissionDocument(companyId, req.consumerAuth.uid, applicationId, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_DOCUMENT_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/submit", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const applicationId = String(req.params.applicationId || "").trim();
            const app = await submitAdmissionApplication(companyId, req.consumerAuth.uid, applicationId, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_SUBMIT_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/withdraw", consumerGuard, async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const applicationId = String(req.params.applicationId || "").trim();
            const result = await withdrawAdmissionApplication(companyId, req.consumerAuth.uid, applicationId);
            res.json({ ok: true, data: result });
        } catch (err) {
            fail(res, err, "ADMISSION_WITHDRAW_FAILED");
        }
    });

    // —— Stage 4: staff admissions workspace ——

    app.get("/api/education/v1/orgs/:companyId/admission-applications", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const status = String(req.query.status || "").trim();
            const campusId = String(req.query.campusId || "").trim();
            const academicYear = String(req.query.academicYear || "").trim();
            const data = await listAdmissionsForSchool(companyId, {
                status: status || undefined,
                campusId: campusId || undefined,
                academicYear: academicYear || undefined,
                limit: req.query.limit,
            });
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "ADMISSION_QUEUE_FAILED");
        }
    });

    app.get("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/staff", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const applicationId = String(req.params.applicationId || "").trim();
            const app = await getAdmissionForSchool(companyId, applicationId);
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_STAFF_READ_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/transition", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const applicationId = String(req.params.applicationId || "").trim();
            const actorUid = ctx.uid || req.auth?.uid || "staff";
            const app = await staffTransitionAdmission(companyId, applicationId, actorUid, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_TRANSITION_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/decision", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const applicationId = String(req.params.applicationId || "").trim();
            const actorUid = ctx.uid || req.auth?.uid || "staff";
            const app = await staffRecordAdmissionDecision(companyId, applicationId, actorUid, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_DECISION_FAILED");
        }
    });

    app.post("/api/education/v1/orgs/:companyId/admission-applications/:applicationId/documents/staff", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const applicationId = String(req.params.applicationId || "").trim();
            const actorUid = ctx.uid || req.auth?.uid || "staff";
            const app = await staffUpdateAdmissionDocument(companyId, applicationId, actorUid, req.body || {});
            res.json({ ok: true, data: { application: app } });
        } catch (err) {
            fail(res, err, "ADMISSION_DOCUMENT_STAFF_FAILED");
        }
    });
}
