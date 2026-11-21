/**
 * SNET-03 — public listing images (logo / cover) uploaded from Company Portal.
 * Bytes in chat media blob store; stable https URL with content token for Discover + Sarah App.
 */
import { randomUUID, createHmac, createHash } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { putChatMediaBlob, readChatMediaBlob } from "../users/chatMediaBlobStore.js";

const uploads = createNetworkCollection(NETWORK_COLLECTIONS.LISTING_MEDIA_UPLOADS);

const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function signingSecret() {
    return String(process.env.LISTING_MEDIA_SIGNING_SECRET || process.env.CHAT_MEDIA_SIGNING_SECRET || "listing-media-dev-secret");
}

function signToken(uploadId, companyId) {
    return createHmac("sha256", signingSecret()).update(`${uploadId}:${companyId}:listing_public`).digest("hex");
}

export function publicApiBase() {
    const fromEnv = String(process.env.PUBLIC_API_BASE_URL || "").trim();
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
    if (domain) return `https://${domain.replace(/^https?:\/\//, "")}`;
    return "https://ziricai-production.up.railway.app";
}

/** Consumer-facing origin for Discover / Sarah App image URLs (proxies /api to Railway). */
export function publicMediaOrigin() {
    const fromEnv =
        String(process.env.PUBLIC_MEDIA_ORIGIN || "").trim() ||
        String(process.env.SARAH_APP_ORIGIN || "").trim() ||
        String(process.env.SARAH_BASE_URL || "").trim();
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    return "https://sarah.ziricai.com";
}

/** Relative path — portal (app) and Sarah App each proxy /api to Railway. */
export function buildListingMediaRelativeUrl(uploadId, token) {
    return `/api/network/v1/listing-media/${encodeURIComponent(uploadId)}/content?token=${encodeURIComponent(token)}`;
}

export function buildListingMediaPublicUrl(uploadId, token) {
    return buildListingMediaRelativeUrl(uploadId, token);
}

/** Absolute URL for off-site links only (email, webhooks). */
export function buildListingMediaAbsoluteUrl(uploadId, token, origin = null) {
    const base = String(origin || publicMediaOrigin() || "").replace(/\/$/, "");
    return `${base}${buildListingMediaRelativeUrl(uploadId, token)}`;
}

export async function createListingMediaUpload(companyId, input = {}) {
    const mimeType = String(input.mimeType || "").trim().toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
        throw err(415, "UPLOAD_TYPE_NOT_ALLOWED", "Use JPEG, PNG, or WebP.");
    }
    const byteLength = Number(input.byteLength || 0);
    if (byteLength > MAX_BYTES) throw err(400, "FILE_TOO_LARGE", "Image must be 5 MB or smaller.");
    const uploadId = `lmed_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const token = signToken(uploadId, companyId);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
    const doc = {
        uploadId,
        companyId,
        mimeType,
        fileName: input.fileName ? String(input.fileName).slice(0, 200) : null,
        byteLength: byteLength || null,
        token,
        status: "pending",
        expiresAt,
        createdAt: new Date().toISOString(),
    };
    await uploads.put(uploadId, doc, { merge: false });
    return { uploadId, token, expiresAt, mimeType, maxBytes: MAX_BYTES };
}

export async function completeListingMediaUpload(companyId, uploadId, token, body) {
    const id = String(uploadId || "");
    const doc = await uploads.get(id);
    if (!doc || doc.companyId !== companyId) throw err(404, "UPLOAD_NOT_FOUND", "Upload not found.");
    if (doc.token !== token) throw err(403, "UPLOAD_TOKEN_INVALID", "Invalid upload token.");
    if (doc.status !== "pending") throw err(409, "UPLOAD_ALREADY_COMPLETED", "Upload already completed.");
    if (new Date(doc.expiresAt).getTime() < Date.now()) throw err(410, "UPLOAD_EXPIRED", "Upload token expired.");
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
    if (!bytes.length) throw err(400, "FILE_EMPTY", "File is empty.");
    if (bytes.length > MAX_BYTES) throw err(400, "FILE_TOO_LARGE", "Image must be 5 MB or smaller.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await putChatMediaBlob(
        {
            uploadId: id,
            personId: `listing:${companyId}`,
            mimeType: doc.mimeType,
            fileName: doc.fileName,
            sha256,
        },
        bytes
    );
    const publicUrl = buildListingMediaPublicUrl(id, doc.token);
    const next = {
        ...doc,
        status: "ready",
        byteLength: bytes.length,
        sha256,
        publicUrl,
        completedAt: new Date().toISOString(),
    };
    await uploads.put(id, next, { merge: false });
    return { uploadId: id, publicUrl, byteLength: bytes.length, sha256, mimeType: doc.mimeType };
}

export async function getListingMediaContent(uploadId, token) {
    const id = String(uploadId || "");
    const doc = await uploads.get(id);
    if (!doc || doc.status !== "ready") throw err(404, "MEDIA_NOT_FOUND", "Image not found.");
    if (doc.token !== token) throw err(403, "MEDIA_FORBIDDEN", "Invalid token.");
    const stored = await readChatMediaBlob(id);
    if (!stored?.bytes?.length) throw err(410, "MEDIA_BODY_MISSING", "Image unavailable.");
    return { buffer: stored.bytes, mimeType: stored.meta.mimeType || doc.mimeType, fileName: doc.fileName };
}

export function clearListingMediaForTests() {
    uploads.clearMemory();
}
