/**
 * REC-02 — Recommendations offering catalogue + verification API.
 */
import express from "express";
import { PLATFORM_PERMISSIONS as P, requirePlatformPermission } from "../auth/platformRbac.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import { isRecOfferingsApiEnabled } from "../recommendations/recommendationConfig.js";
import {
    listOfferingsForCompany,
    getOffering,
    createOffering,
    updateOffering,
} from "../recommendations/offeringService.js";
import { OFFERING_VERIFICATION_CHECKS } from "../recommendations/offeringConstants.js";
import {
    submitOfferingVerification,
    getOfferingVerificationStatus,
    listOfferingVerificationQueue,
    getOfferingVerificationCase,
    decideOfferingVerification,
} from "../recommendations/offeringVerificationService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: {
            code: err.code || fallbackCode,
            message: err.message || "Request failed",
        },
    });
}

function ensureRecApiEnabled(res) {
    if (!isRecOfferingsApiEnabled()) {
        res.status(503).json({
            ok: false,
            error: { code: "RECOMMENDATIONS_DISABLED", message: "Recommendations offerings API is disabled." },
        });
        return false;
    }
    return true;
}

function actorOf(req) {
    return req.tenant?.uid || req.platformAuth?.uid || "unknown";
}

/**
 * @param {import('express').Express} app
 * @param {{ authorize?: Function, platformGuard?: Function }} [deps]
 */
export function mountRecommendationRoutes(app, deps = {}) {
    const authorize = deps.authorize || defaultAuthorize;
    const guardRead = deps.platformGuard || requirePlatformPermission(P.VERIFICATION_READ);
    const guardDecide = deps.platformGuard || requirePlatformPermission(P.VERIFICATION_DECIDE);

    app.get("/api/companies/:companyId/recommendations/offerings", async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const companyId = String(req.params.companyId || "");
            await authorize(req, companyId, { write: false });
            const offerings = await listOfferingsForCompany(companyId);
            res.json({ ok: true, data: { offerings } });
        } catch (err) {
            fail(res, err, "OFFERINGS_LIST_FAILED");
        }
    });

    app.post("/api/companies/:companyId/recommendations/offerings", async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const companyId = String(req.params.companyId || "");
            const tenant = await authorize(req, companyId, { write: true });
            const offering = await createOffering(companyId, req.body || {}, tenant.uid);
            res.status(201).json({ ok: true, data: { offering } });
        } catch (err) {
            fail(res, err, "OFFERING_CREATE_FAILED");
        }
    });

    app.patch("/api/companies/:companyId/recommendations/offerings/:offeringId", async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const companyId = String(req.params.companyId || "");
            const offeringId = String(req.params.offeringId || "");
            const tenant = await authorize(req, companyId, { write: true });
            const offering = await updateOffering(companyId, offeringId, req.body || {}, tenant.uid);
            res.json({ ok: true, data: { offering } });
        } catch (err) {
            fail(res, err, "OFFERING_UPDATE_FAILED");
        }
    });

    app.get("/api/companies/:companyId/recommendations/offerings/:offeringId/verification", async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const companyId = String(req.params.companyId || "");
            const offeringId = String(req.params.offeringId || "");
            await authorize(req, companyId, { write: false });
            const status = await getOfferingVerificationStatus(companyId, offeringId);
            res.json({ ok: true, data: status });
        } catch (err) {
            fail(res, err, "OFFERING_VERIFICATION_STATUS_FAILED");
        }
    });

    app.post("/api/companies/:companyId/recommendations/offerings/:offeringId/submit-verification", async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const companyId = String(req.params.companyId || "");
            const offeringId = String(req.params.offeringId || "");
            const tenant = await authorize(req, companyId, { write: true });
            const kase = await submitOfferingVerification(companyId, offeringId, tenant.uid);
            res.status(201).json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "OFFERING_VERIFICATION_SUBMIT_FAILED");
        }
    });

    app.get("/api/operations/recommendations/verification-queue", guardRead, async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const status = req.query?.status ? String(req.query.status) : undefined;
            const limit = Math.min(200, Number(req.query?.limit) || 100);
            const cases = await listOfferingVerificationQueue({ status, limit });
            res.json({ ok: true, data: { cases, checks: OFFERING_VERIFICATION_CHECKS } });
        } catch (err) {
            fail(res, err, "OFFERING_VERIFICATION_QUEUE_FAILED");
        }
    });

    app.get("/api/operations/recommendations/verification-queue/:caseId", guardRead, async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const kase = await getOfferingVerificationCase(String(req.params.caseId || ""));
            if (!kase) return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found." } });
            const offering = await getOffering(kase.companyId, kase.offeringId);
            res.json({ ok: true, data: { case: kase, offering } });
        } catch (err) {
            fail(res, err, "OFFERING_VERIFICATION_CASE_FAILED");
        }
    });

    app.post("/api/operations/recommendations/verification-queue/:caseId/decision", guardDecide, async (req, res) => {
        if (!ensureRecApiEnabled(res)) return;
        try {
            const caseId = String(req.params.caseId || "");
            const actor = actorOf(req);
            const kase = await decideOfferingVerification(caseId, req.body || {}, actor);
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "OFFERING_VERIFICATION_DECISION_FAILED");
        }
    });
}