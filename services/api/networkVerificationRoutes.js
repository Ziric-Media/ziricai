/**
 * SNET-04 — verification API.
 *   Tenant (member; writes owner/manager):
 *     GET  /api/network/v1/orgs/:companyId/verification
 *     POST /api/network/v1/orgs/:companyId/verification        (submit for verification)
 *   Platform (superadmin / platform key):
 *     GET  /api/platform/network/v1/verification?status=
 *     GET  /api/platform/network/v1/verification/:caseId
 *     POST /api/platform/network/v1/verification/:caseId/decision   { action, note, checks[] }
 */
import { requirePlatformAccess } from "../auth/platformAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    getVerificationStatus,
    submitVerification,
    listVerificationCases,
    getVerificationCase,
    decideVerification,
    VERIFICATION_CHECKS,
} from "../network/verificationService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: {
            code: err.code || fallbackCode,
            message: err.message || "Request failed",
            ...(err.missing ? { missing: err.missing } : {}),
        },
    });
}

function actorOf(req) {
    return req.platformAuth?.uid || (req.platformAuth?.via === "api_key" ? "platform_api_key" : "unknown");
}

/**
 * @param {import('express').Express} app
 * @param {{ authorize?: Function, platformGuard?: Function }} [deps] test seams
 */
export function mountNetworkVerificationRoutes(app, deps = {}) {
    const authorize = deps.authorize || defaultAuthorize;
    const platformGuard = deps.platformGuard || requirePlatformAccess();

    app.get("/api/network/v1/orgs/:companyId/verification", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            res.json({ ok: true, data: await getVerificationStatus(companyId) });
        } catch (err) {
            fail(res, err, "VERIFICATION_STATUS_FAILED");
        }
    });

    app.post("/api/network/v1/orgs/:companyId/verification", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const kase = await submitVerification(companyId, ctx?.uid || null);
            res.status(201).json({ ok: true, data: { caseId: kase.caseId, status: kase.status, snId: kase.snId } });
        } catch (err) {
            fail(res, err, "VERIFICATION_SUBMIT_FAILED");
        }
    });

    app.get("/api/platform/network/v1/verification", platformGuard, async (req, res) => {
        try {
            const cases = await listVerificationCases({
                status: req.query.status ? String(req.query.status) : undefined,
                limit: Number(req.query.limit) || 100,
            });
            res.json({ ok: true, data: { cases, checks: VERIFICATION_CHECKS } });
        } catch (err) {
            fail(res, err, "VERIFICATION_LIST_FAILED");
        }
    });

    app.get("/api/platform/network/v1/verification/:caseId", platformGuard, async (req, res) => {
        try {
            const kase = await getVerificationCase(req.params.caseId);
            if (!kase) {
                return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Verification case not found." } });
            }
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "VERIFICATION_READ_FAILED");
        }
    });

    app.post("/api/platform/network/v1/verification/:caseId/decision", platformGuard, async (req, res) => {
        try {
            const kase = await decideVerification(req.params.caseId, req.body || {}, actorOf(req));
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "VERIFICATION_DECISION_FAILED");
        }
    });
}
