/**
 * SNET-04 — verification API.
 *   Tenant (member; writes owner/manager):
 *     GET  /api/network/v1/orgs/:companyId/verification
 *     POST /api/network/v1/orgs/:companyId/verification        (submit for verification; optional evidence[] refs)
 *     POST /api/network/v1/orgs/:companyId/verification/evidence  { items: [{ kind, label, url?|ref?|uploadId? }] }  (https URL / external ref / uploaded file ref)
 *     POST /api/network/v1/orgs/:companyId/verification/evidence-uploads        (Gate 6: signed token; tenant-scoped chat-media mechanism)
 *     PUT  /api/network/v1/orgs/:companyId/verification/evidence-uploads/:uploadId?token=   (raw bytes → content-checked, stored (Phase 2.0), size + sha256 recorded)
 *   Platform (superadmin / platform key / verification_officer role):
 *     GET  /api/platform/network/v1/verification?status=
 *     GET  /api/platform/network/v1/verification/:caseId
 *     GET  /api/platform/network/v1/verification/:caseId/evidence/:evidenceId/download   (Phase 2.0: audited attachment)
 *     POST /api/platform/network/v1/verification/:caseId/decision   { action: start_review|request_info|verify(approve)|reject|restrict, note, checks[] }
 */
import express from "express";
import { PLATFORM_PERMISSIONS as PERM, platformAuthAllows, requirePlatformPermission } from "../auth/platformRbac.js";
import { recordNetworkAdminAction } from "../network/networkAdminAudit.js";
import { getEvidenceBlobMeta, putEvidenceBlob, readEvidenceBlob } from "../network/evidenceBlobStore.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    createScopedMediaUpload,
    completeScopedMediaUpload,
    consumeScopedMediaUpload,
    discardScopedMediaUpload,
    releaseScopedMediaUpload,
} from "../users/chatMediaService.js";
import {
    getVerificationStatus,
    submitVerification,
    addVerificationEvidence,
    withTrustedFileRef,
    getEvidenceFileForCase,
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
async function resolveEvidenceUploads(companyId, items) {
    const consumed = [];
    if (!Array.isArray(items)) return { items, consumed };
    try {
        const out = items.map((raw) => {
            const { fileRef: _ignored, uploadId, ...item } = raw && typeof raw === "object" ? raw : {};
            if (!uploadId) return { item, ref: null };
            const ref = consumeScopedMediaUpload(String(uploadId), evidenceScope(companyId).subject, EVIDENCE_UPLOAD_PURPOSE);
            consumed.push(ref.uploadId);
            return { item, ref };
        });
        // Phase 2.0: mark file refs whose bytes are durably stored so officers know they can download them.
        const resolved = [];
        for (const { item, ref } of out) {
            if (!ref) {
                resolved.push(item);
                continue;
            }
            const stored = Boolean(await getEvidenceBlobMeta(ref.uploadId));
            resolved.push(withTrustedFileRef(item, { ...ref, stored }));
        }
        return { items: resolved, consumed };
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
    // Per-permission guards (Phase 2.0 RBAC); tests inject one guard for every platform route.
    const guardFor = (permission) => deps.platformGuard || requirePlatformPermission(permission);

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
            const resolved = await resolveEvidenceUploads(companyId, req.body?.evidence);
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
            const resolved = await resolveEvidenceUploads(companyId, items);
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
                    note: "The file is stored for Ziricai verification officers only (size + sha256 recorded). It is not malware-scanned yet.",
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
                const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
                const file = completeScopedMediaUpload(
                    req.params.uploadId,
                    evidenceScope(companyId).subject,
                    EVIDENCE_UPLOAD_PURPOSE,
                    String(req.query?.token || ""),
                    bytes
                );
                try {
                    await putEvidenceBlob({ ...file, companyId }, bytes);
                } catch (storeErr) {
                    discardScopedMediaUpload(file.uploadId); // rejected bytes must not be attachable
                    throw storeErr;
                }
                res.json({ ok: true, data: { file: { ...file, stored: true } } });
            } catch (err) {
                fail(res, err, "EVIDENCE_UPLOAD_FAILED");
            }
        }
    );

    app.get("/api/platform/network/v1/verification", guardFor(PERM.VERIFICATION_READ), async (req, res) => {
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

    app.get("/api/platform/network/v1/verification/:caseId", guardFor(PERM.VERIFICATION_READ), async (req, res) => {
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

    // Phase 2.0 — officer download of a stored evidence file (audited; never cached; served as an attachment).
    app.get("/api/platform/network/v1/verification/:caseId/evidence/:evidenceId/download", guardFor(PERM.VERIFICATION_EVIDENCE), async (req, res) => {
        try {
            const found = await getEvidenceFileForCase(String(req.params.caseId || ""), String(req.params.evidenceId || ""));
            if (!found) {
                return res.status(404).json({ ok: false, error: { code: "EVIDENCE_FILE_NOT_FOUND", message: "No file is attached to this evidence item." } });
            }
            const blob = await readEvidenceBlob(found.file.uploadId);
            if (!blob || blob.meta.companyId !== found.kase.companyId) {
                return res.status(404).json({
                    ok: false,
                    error: { code: "EVIDENCE_FILE_NOT_STORED", message: "This file was recorded before file storage existed (checksum only); ask the business to upload it again." },
                });
            }
            await recordNetworkAdminAction({
                actor: actorOf(req),
                action: "verification.evidence_download",
                snId: found.kase.snId,
                companyId: found.kase.companyId,
                detail: { caseId: found.kase.caseId, evidenceId: found.evidence.evidenceId, uploadId: blob.meta.uploadId, sha256: blob.meta.sha256 },
            });
            const safeName = String(blob.meta.fileName || "evidence").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "evidence";
            res.set({
                "Content-Type": blob.meta.mimeType,
                "Content-Length": String(blob.bytes.length),
                "Content-Disposition": `attachment; filename="${safeName}"`,
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "Cache-Control": "private, no-store",
            });
            res.status(200).send(blob.bytes);
        } catch (err) {
            fail(res, err, "EVIDENCE_DOWNLOAD_FAILED");
        }
    });

    app.post("/api/platform/network/v1/verification/:caseId/decision", guardFor(PERM.VERIFICATION_DECIDE), async (req, res) => {
        try {
            // Restricting a business is a Trust & Safety / Super Admin action — Verification Officers cannot do it.
            if (String(req.body?.action || "") === "restrict" && !platformAuthAllows(req.platformAuth, PERM.VERIFICATION_RESTRICT)) {
                return res.status(403).json({
                    ok: false,
                    error: { code: "PLATFORM_FORBIDDEN", message: "Restricting a business requires Trust & Safety or Super Admin access." },
                });
            }
            const kase = await decideVerification(req.params.caseId, req.body || {}, actorOf(req));
            res.json({ ok: true, data: { case: kase } });
        } catch (err) {
            fail(res, err, "VERIFICATION_DECISION_FAILED");
        }
    });
}
