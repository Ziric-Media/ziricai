/**
 * SNET-04 — verification API.
 *   Tenant (member; writes owner/manager):
 *     GET  /api/network/v1/orgs/:companyId/verification
 *     POST /api/network/v1/orgs/:companyId/verification        (submit for verification; optional evidence[] refs)
 *     POST /api/network/v1/orgs/:companyId/verification/evidence  { items: [{ kind, label, url?|ref?|uploadId? }] }  (https URL / external ref / uploaded file ref)
 *     POST /api/network/v1/orgs/:companyId/verification/evidence-uploads        (Gate 6: signed token; tenant-scoped chat-media mechanism)
 *     PUT  /api/network/v1/orgs/:companyId/verification/evidence-uploads/:uploadId?token=   (raw bytes → size + sha256 recorded)
 *   Platform (superadmin / platform key):
 *     GET  /api/platform/network/v1/verification?status=
 *     GET  /api/platform/network/v1/verification/:caseId
 *     POST /api/platform/network/v1/verification/:caseId/decision   { action: start_review|request_info|verify(approve)|reject|restrict, note, checks[] }
 */
import express from "express";
import { requirePlatformAccess } from "../auth/platformAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    createScopedMediaUpload,
    completeScopedMediaUpload,
    consumeScopedMediaUpload,
    releaseScopedMediaUpload,
} from "../users/chatMediaService.js";
import {
    getVerificationStatus,
    submitVerification,
    addVerificationEvidence,
    withTrustedFileRef,
    EVIDENCE_KINDS,
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
            ...(err.fields ? { fields: err.fields } : {}),
        },
    });
}

const EVIDENCE_UPLOAD_PURPOSE = "network_verification_evidence";
const EVIDENCE_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/** Tenant-bound scope: tokens are HMAC-bound to the company, never to a consumer person. */
function evidenceScope(companyId) {
    return {
        subject: `tenant:${companyId}`,
        purpose: EVIDENCE_UPLOAD_PURPOSE,
        allowedMimeTypes: EVIDENCE_MIME_TYPES,
        maxBytes: 5 * 1024 * 1024,
    };
}

/**
 * Turn `{ uploadId }` items into server-trusted file references. Any client-supplied `fileRef` is dropped.
 * Returns the ids consumed so the caller can release them if the attach fails afterwards.
 */
function resolveEvidenceUploads(companyId, items) {
    const consumed = [];
    if (!Array.isArray(items)) return { items, consumed };
    try {
        const out = items.map((raw) => {
            const { fileRef: _ignored, uploadId, ...item } = raw && typeof raw === "object" ? raw : {};
            if (!uploadId) return item;
            const ref = consumeScopedMediaUpload(String(uploadId), evidenceScope(companyId).subject, EVIDENCE_UPLOAD_PURPOSE);
            consumed.push(ref.uploadId);
            return withTrustedFileRef(item, ref);
        });
        return { items: out, consumed };
    } catch (err) {
        consumed.forEach(releaseScopedMediaUpload);
        throw err;
    }
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
            res.json({ ok: true, data: { ...(await getVerificationStatus(companyId)), evidenceKinds: EVIDENCE_KINDS } });
        } catch (err) {
            fail(res, err, "VERIFICATION_STATUS_FAILED");
        }
    });

    app.post("/api/network/v1/orgs/:companyId/verification", async (req, res) => {
        let consumed = [];
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const resolved = resolveEvidenceUploads(companyId, req.body?.evidence);
            consumed = resolved.consumed;
            const kase = await submitVerification(companyId, ctx?.uid || null, { evidence: resolved.items });
            res.status(201).json({
                ok: true,
                data: { caseId: kase.caseId, status: kase.status, snId: kase.snId, evidenceCount: kase.evidenceCount || 0 },
            });
        } catch (err) {
            consumed.forEach(releaseScopedMediaUpload);
            fail(res, err, "VERIFICATION_SUBMIT_FAILED");
        }
    });

    app.post("/api/network/v1/orgs/:companyId/verification/evidence", async (req, res) => {
        let consumed = [];
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const items = Array.isArray(req.body?.items) ? req.body.items : req.body && (req.body.label || req.body.url || req.body.uploadId) ? [req.body] : [];
            const resolved = resolveEvidenceUploads(companyId, items);
            consumed = resolved.consumed;
            const result = await addVerificationEvidence(companyId, resolved.items, ctx?.uid || null);
            res.status(201).json({ ok: true, data: result });
        } catch (err) {
            consumed.forEach(releaseScopedMediaUpload);
            fail(res, err, "VERIFICATION_EVIDENCE_FAILED");
        }
    });

    // Gate 6 — evidence file reference via the chat-media token mechanism (tenant-scoped, metadata + sha256 only).
    //   1. POST …/verification/evidence-uploads  { mimeType, fileName, byteLength? } → { uploadId, token, putPath, … }
    //   2. PUT  putPath (raw body)                                                    → { file: { sha256, byteLength, … } }
    //   3. POST …/verification/evidence  { items: [{ kind, label, uploadId }] }       → file ref stored on the case
    app.post("/api/network/v1/orgs/:companyId/verification/evidence-uploads", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: true });
            const upload = createScopedMediaUpload(evidenceScope(companyId), req.body || {});
            res.status(201).json({
                ok: true,
                data: {
                    ...upload,
                    putPath: `/api/network/v1/orgs/${encodeURIComponent(companyId)}/verification/evidence-uploads/${encodeURIComponent(upload.uploadId)}`,
                    note: "Metadata only: size and sha256 of the file are recorded; the file itself is not stored or scanned yet.",
                },
            });
        } catch (err) {
            fail(res, err, "EVIDENCE_UPLOAD_FAILED");
        }
    });

    app.put(
        "/api/network/v1/orgs/:companyId/verification/evidence-uploads/:uploadId",
        express.raw({ type: "*/*", limit: "11mb" }),
        async (req, res) => {
            try {
                const companyId = String(req.params.companyId || "").trim();
                await authorize(req, companyId, { write: true });
                const file = completeScopedMediaUpload(
                    req.params.uploadId,
                    evidenceScope(companyId).subject,
                    EVIDENCE_UPLOAD_PURPOSE,
                    String(req.query?.token || ""),
                    Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "")
                );
                res.json({ ok: true, data: { file } });
            } catch (err) {
                fail(res, err, "EVIDENCE_UPLOAD_FAILED");
            }
        }
    );

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
