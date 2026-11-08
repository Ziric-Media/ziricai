/**
 * CHAT-01 — Chat media upload tokens (signed URL MVP; metadata-only body).
 */
import { randomUUID, createHmac, createHash } from "node:crypto";
import { personIdFromUserId } from "./identityContracts.js";

const UPLOAD_TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;

/** @type {Map<string, object>} */
const uploads = new Map();

function signToken(uploadId, personId, expiresAt) {
    const secret = String(process.env.CHAT_MEDIA_SIGNING_SECRET || "chat-media-dev-secret");
    return createHmac("sha256", secret).update(`${uploadId}:${personId}:${expiresAt}`).digest("hex");
}

/**
 * @param {string} userId
 * @param {{ mimeType?: string, byteLength?: number, fileName?: string }} input
 */
export function createChatMediaUpload(userId, input = {}) {
    const personId = personIdFromUserId(userId);
    const byteLength = Number(input.byteLength || 0);
    if (byteLength > MAX_BYTES) {
        throw Object.assign(new Error("File exceeds 10MB limit"), { status: 400, code: "FILE_TOO_LARGE" });
    }
    const mimeType = String(input.mimeType || "application/octet-stream").slice(0, 120);
    const uploadId = `cmed_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
    const token = signToken(uploadId, personId, expiresAt);
    const base =
        String(process.env.PUBLIC_API_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "").trim() ||
        "https://ziricai-production.up.railway.app";
    const uploadUrl = `${base.replace(/\/$/, "")}/api/chat/media/${encodeURIComponent(uploadId)}?token=${token}`;
    const record = {
        uploadId,
        personId,
        mimeType,
        fileName: input.fileName ? String(input.fileName).slice(0, 200) : null,
        byteLength: byteLength || null,
        expiresAt,
        token,
        status: "pending",
        createdAt: new Date().toISOString(),
    };
    uploads.set(uploadId, record);
    return { uploadId, uploadUrl, expiresAt, mimeType, maxBytes: MAX_BYTES };
}

/**
 * @param {string} uploadId
 * @param {string} personId
 * @param {string} token
 * @param {Buffer|null} body
 */
export function completeChatMediaUpload(uploadId, personId, token, body) {
    const record = uploads.get(uploadId);
    if (!record || record.purpose) throw Object.assign(new Error("Upload not found"), { status: 404, code: "UPLOAD_NOT_FOUND" });
    if (record.personId !== personId) {
        throw Object.assign(new Error("Forbidden"), { status: 403, code: "UPLOAD_FORBIDDEN" });
    }
    if (record.token !== token) {
        throw Object.assign(new Error("Invalid upload token"), { status: 403, code: "UPLOAD_TOKEN_INVALID" });
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
        throw Object.assign(new Error("Upload token expired"), { status: 410, code: "UPLOAD_EXPIRED" });
    }
    const size = body?.length || 0;
    if (size > MAX_BYTES) {
        throw Object.assign(new Error("File exceeds 10MB limit"), { status: 400, code: "FILE_TOO_LARGE" });
    }
    record.status = "ready";
    record.byteLength = size;
    record.completedAt = new Date().toISOString();
  record.storageKey = `chat-media/${personId}/${uploadId}`;
    const attachment = {
        id: uploadId,
        mimeType: record.mimeType,
        fileName: record.fileName,
        byteLength: size,
        url: `/api/chat/media/${encodeURIComponent(uploadId)}/download?token=${token}`,
        kind: record.mimeType.startsWith("image/") ? "image" : "file",
    };
    record.attachment = attachment;
    uploads.set(uploadId, record);
    return attachment;
}

export function getChatMediaAttachment(uploadId, personId, token) {
    const record = uploads.get(uploadId);
    if (!record || record.purpose || record.status !== "ready") {
        throw Object.assign(new Error("Attachment not found"), { status: 404, code: "ATTACHMENT_NOT_FOUND" });
    }
    if (record.personId !== personId || record.token !== token) {
        throw Object.assign(new Error("Forbidden"), { status: 403, code: "ATTACHMENT_FORBIDDEN" });
    }
    return record.attachment;
}

export function clearChatMediaForTests() {
    uploads.clear();
}

/* ------------------------------------------------------------------------------------------------
 * Scoped (non-consumer) uploads — Gate 6.
 * Same signed-token mechanism, but bound to an explicit `subject` string (e.g. "tenant:<companyId>") and a
 * `purpose`, never to a consumer personId. Consumer-facing functions above refuse these records, and scoped
 * functions refuse consumer records, so the two trust domains cannot be mixed. As with chat media the MVP stores
 * metadata only: size + sha256 of the received bytes; the bytes themselves are not persisted and not scanned.
 * ------------------------------------------------------------------------------------------------ */

const SCOPED_MAX_BYTES = 10 * 1024 * 1024;

function scopedErr(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

/**
 * @param {{ subject: string, purpose: string, allowedMimeTypes: string[], maxBytes?: number }} scope
 * @param {{ mimeType?: string, byteLength?: number, fileName?: string }} input
 */
export function createScopedMediaUpload(scope, input = {}) {
    const { subject, purpose, allowedMimeTypes } = scope || {};
    if (!subject || !purpose || !Array.isArray(allowedMimeTypes) || !allowedMimeTypes.length) {
        throw scopedErr(500, "UPLOAD_SCOPE_INVALID", "Upload scope is not configured.");
    }
    const maxBytes = Math.min(Number(scope.maxBytes) || SCOPED_MAX_BYTES, SCOPED_MAX_BYTES);
    const mimeType = String(input.mimeType || "").trim().toLowerCase().slice(0, 120);
    if (!allowedMimeTypes.includes(mimeType)) {
        throw scopedErr(415, "UPLOAD_TYPE_NOT_ALLOWED", `File type not allowed. Use one of: ${allowedMimeTypes.join(", ")}`);
    }
    const byteLength = Number(input.byteLength || 0);
    if (byteLength > maxBytes) throw scopedErr(400, "FILE_TOO_LARGE", `File exceeds ${Math.floor(maxBytes / 1024 / 1024)}MB limit`);
    const uploadId = `smed_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
    const token = signToken(uploadId, `${purpose}:${subject}`, expiresAt);
    uploads.set(uploadId, {
        uploadId,
        subject,
        purpose,
        personId: null,
        mimeType,
        fileName: input.fileName ? String(input.fileName).replace(/[\u0000-\u001f<>"\\/]/g, "_").slice(0, 200) : null,
        byteLength: byteLength || null,
        maxBytes,
        expiresAt,
        token,
        status: "pending",
        createdAt: new Date().toISOString(),
    });
    return { uploadId, token, expiresAt, mimeType, maxBytes, allowedMimeTypes };
}

function scopedRecord(uploadId, subject, purpose, token) {
    const record = uploads.get(uploadId);
    if (!record || record.purpose !== purpose) throw scopedErr(404, "UPLOAD_NOT_FOUND", "Upload not found");
    if (record.subject !== subject) throw scopedErr(403, "UPLOAD_FORBIDDEN", "Forbidden");
    if (token !== undefined && record.token !== token) throw scopedErr(403, "UPLOAD_TOKEN_INVALID", "Invalid upload token");
    if (new Date(record.expiresAt).getTime() < Date.now()) throw scopedErr(410, "UPLOAD_EXPIRED", "Upload token expired");
    return record;
}

/** Receive the bytes for a pending scoped upload (records size + sha256; bytes are not retained). */
export function completeScopedMediaUpload(uploadId, subject, purpose, token, body) {
    const record = scopedRecord(uploadId, subject, purpose, token);
    if (record.status !== "pending") throw scopedErr(409, "UPLOAD_ALREADY_COMPLETED", "Upload already completed");
    const size = body?.length || 0;
    if (!size) throw scopedErr(400, "FILE_EMPTY", "File is empty");
    if (size > record.maxBytes) throw scopedErr(400, "FILE_TOO_LARGE", `File exceeds ${Math.floor(record.maxBytes / 1024 / 1024)}MB limit`);
    record.status = "ready";
    record.byteLength = size;
    record.sha256 = createHash("sha256").update(body).digest("hex");
    record.completedAt = new Date().toISOString();
    uploads.set(uploadId, record);
    return { uploadId, mimeType: record.mimeType, fileName: record.fileName, byteLength: size, sha256: record.sha256 };
}

/** Undo `consumeScopedMediaUpload` when the attach step failed afterwards (so the tenant can retry). */
export function releaseScopedMediaUpload(uploadId) {
    const record = uploads.get(uploadId);
    if (record?.purpose && record.status === "attached") {
        record.status = "ready";
        uploads.set(uploadId, record);
    }
}

/**
 * Resolve a completed scoped upload into a durable file reference and mark it attached (single use).
 * @returns {{ uploadId: string, fileName: string|null, mimeType: string, byteLength: number, sha256: string }}
 */
export function consumeScopedMediaUpload(uploadId, subject, purpose) {
    const record = scopedRecord(uploadId, subject, purpose);
    if (record.status === "attached") throw scopedErr(409, "UPLOAD_ALREADY_ATTACHED", "This file is already attached");
    if (record.status !== "ready") throw scopedErr(409, "UPLOAD_NOT_READY", "Upload the file before attaching it");
    record.status = "attached";
    uploads.set(uploadId, record);
    return {
        uploadId,
        fileName: record.fileName,
        mimeType: record.mimeType,
        byteLength: record.byteLength,
        sha256: record.sha256,
    };
}
