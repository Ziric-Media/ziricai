/**
 * CHAT-01 — durable consumer chat media (images, video, voice).
 *
 * Firestore Admin (or in-memory when STORAGE_BACKEND=memory): metadata + chunked bytes, same layout as verification
 * evidence blobs. Served only via token-gated `/api/chat/media/:id/content` — never public listing.
 */
import { createHash } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

const blobs = createNetworkCollection(NETWORK_COLLECTIONS.CHAT_MEDIA_BLOBS);
const chunks = createNetworkCollection(NETWORK_COLLECTIONS.CHAT_MEDIA_BLOB_CHUNKS);

export const CHAT_MEDIA_CHUNK_BYTES = 512 * 1024;
export const CHAT_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/webm",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
]);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function assertAllowedChatMediaMime(mimeType) {
    const m = String(mimeType || "").trim().toLowerCase();
    if (!ALLOWED_MIME.has(m)) {
        throw err(415, "UPLOAD_TYPE_NOT_ALLOWED", `File type not allowed for chat media (${m || "unknown"}).`);
    }
}

const chunkId = (uploadId, i) => `${uploadId}_${i}`;

/**
 * @param {{ uploadId: string, personId: string, mimeType: string, fileName?: string|null, sha256: string }} meta
 * @param {Buffer} bytes
 */
export async function putChatMediaBlob(meta, bytes) {
    if (!meta?.uploadId || !meta?.personId) throw err(500, "CHAT_MEDIA_BLOB_INVALID", "uploadId and personId are required.");
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw err(400, "FILE_EMPTY", "File is empty");
    if (bytes.length > CHAT_MEDIA_MAX_BYTES) throw err(400, "FILE_TOO_LARGE", "File exceeds 10MB limit");
    assertAllowedChatMediaMime(meta.mimeType);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (meta.sha256 && meta.sha256 !== sha256) throw err(500, "CHAT_MEDIA_CHECKSUM", "Checksum mismatch while storing the file.");
    const count = Math.ceil(bytes.length / CHAT_MEDIA_CHUNK_BYTES);
    for (let i = 0; i < count; i += 1) {
        const slice = bytes.subarray(i * CHAT_MEDIA_CHUNK_BYTES, (i + 1) * CHAT_MEDIA_CHUNK_BYTES);
        await chunks.put(chunkId(meta.uploadId, i), { uploadId: meta.uploadId, index: i, data: slice.toString("base64") }, { merge: false });
    }
    const doc = {
        uploadId: meta.uploadId,
        personId: meta.personId,
        mimeType: meta.mimeType,
        fileName: meta.fileName || null,
        byteLength: bytes.length,
        sha256,
        chunks: count,
        storedAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    await blobs.put(meta.uploadId, doc, { merge: false });
    return doc;
}

/** @param {string} uploadId */
export async function getChatMediaBlobMeta(uploadId) {
    return (await blobs.get(String(uploadId || ""))) || null;
}

/**
 * @param {string} uploadId
 * @returns {Promise<{ meta: object, bytes: Buffer }|null>}
 */
export async function readChatMediaBlob(uploadId) {
    const meta = await getChatMediaBlobMeta(uploadId);
    if (!meta) return null;
    const parts = [];
    for (let i = 0; i < meta.chunks; i += 1) {
        const row = await chunks.get(chunkId(meta.uploadId, i));
        if (!row?.data) throw err(500, "CHAT_MEDIA_BLOB_INCOMPLETE", "Stored chat media is incomplete.");
        parts.push(Buffer.from(row.data, "base64"));
    }
    const bytes = Buffer.concat(parts);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== meta.byteLength || sha256 !== meta.sha256) {
        throw err(500, "CHAT_MEDIA_BLOB_CORRUPT", "Stored chat media failed its integrity check.");
    }
    return { meta, bytes };
}

/** @param {string} uploadId */
export async function removeChatMediaBlob(uploadId) {
    const meta = await getChatMediaBlobMeta(uploadId);
    await blobs.remove(String(uploadId || ""));
    for (let i = 0; i < (meta?.chunks || 0); i += 1) await chunks.remove(chunkId(uploadId, i));
}

export function clearChatMediaBlobsForTests() {
    blobs.clearMemory();
    chunks.clearMemory();
}
