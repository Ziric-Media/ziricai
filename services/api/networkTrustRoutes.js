/**
 * SNET-10 — trust & safety API (v1).
 *   Consumer:
 *     POST /api/network/v1/entities/:snId/report   { reason, details? }
 *     GET  /api/network/v1/reports                 (my reports — status only)
 *   Platform (superadmin / platform key):
 *     GET  /api/platform/network/v1/moderation?status=&snId=
 *     GET  /api/platform/network/v1/moderation/:caseId
 *     POST /api/platform/network/v1/moderation/:caseId/decision   { action: start_review|dismiss|suspend_entity, note }
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { PLATFORM_PERMISSIONS as PERM, requirePlatformPermission } from "../auth/platformRbac.js";
import {
    decideModerationCase,
    getModerationCase,
    listModerationCases,
    listMyReports,
    reportEntity,
    REPORT_REASONS,
} from "../network/moderationService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

function actorOf(req) {
    return req.platformAuth?.uid || (req.platformAuth?.via === "api_key" ? "platform_api_key" : "unknown");
}

/**
 * @param {import('express').Express} app
 * @param {{ consumerGuard?: Function, platformGuard?: Function }} [deps] test seams
 */
export function mountNetworkTrustRoutes(app, deps = {}) {
    const consumerGuard = deps.consumerGuard || requireConsumerScope();
    const guardFor = (permission) => deps.platformGuard || requirePlatformPermission(permission);

    app.post("/api/network/v1/entities/:snId/report", consumerGuard, async (req, res) => {
        try {
            const result = await reportEntity(req.consumerAuth.uid, String(req.params.snId || ""), req.body || {});
            res.status(result.duplicate ? 200 : 201).json({ ok: true, data: { report: result, reasons: REPORT_REASONS } });
        } catch (err) {
            fail(res, err, "REPORT_FAILED");
        }
    });

    app.get("/api/network/v1/reports", consumerGuard, async (req, res) => {
        try {
            res.json({ ok: true, data: { reports: await listMyReports(req.consumerAuth.uid), reasons: REPORT_REASONS } });
        } catch (err) {
            fail(res, err, "REPORT_LIST_FAILED");
        }
    });

    app.get("/api/platform/network/v1/moderation", guardFor(PERM.MODERATION_READ), async (req, res) => {
        try {
            const cases = await listModerationCases({
                status: String(req.query.status || ""),
                snId: String(req.query.snId || ""),
                limit: req.query.limit,
            });
            res.json({ ok: true, data: { cases } });
        } catch (err) {
            fail(res, err, "MODERATION_LIST_FAILED");
        }
    });

    app.get("/api/platform/network/v1/moderation/:caseId", guardFor(PERM.MODERATION_READ), async (req, res) => {
        try {
            const kase = await getModerationCase(String(req.params.caseId || ""));
            if (!kase) return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Moderation case not found." } });
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "MODERATION_READ_FAILED");
        }
    });

    app.post("/api/platform/network/v1/moderation/:caseId/decision", guardFor(PERM.MODERATION_DECIDE), async (req, res) => {
        try {
            const kase = await decideModerationCase(String(req.params.caseId || ""), req.body || {}, actorOf(req));
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "MODERATION_DECISION_FAILED");
        }
    });
}
