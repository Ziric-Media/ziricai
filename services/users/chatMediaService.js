/**
 * CHAT-01 — Chat media upload tokens (signed URL MVP; metadata-only body).
 */
import { randomUUID, createHmac } from "node:crypto";
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
    if (!record) throw Object.assign(new Error("Upload not found"), { status: 404, code: "UPLOAD_NOT_FOUND" });
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
    if (!record || record.status !== "ready") {
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
