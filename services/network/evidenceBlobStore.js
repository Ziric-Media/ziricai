/**
 * Phase 2.0 — durable storage for verification evidence files.
 *
 * Gate 6 recorded only size + sha256 for an uploaded evidence file and discarded the bytes. This stores the bytes in the
 * network collection adapter (Firestore Admin SDK, or in-memory under STORAGE_BACKEND=memory) so a Verification Officer
 * can download what the business submitted.
 *
 * Layout (server-only collections, default-deny rules):
 *   networkEvidenceBlobs/{uploadId}                 metadata: companyId, fileName, mimeType, byteLength, sha256, chunks
 *   networkEvidenceBlobChunks/{uploadId}_{index}    { uploadId, index, data: base64 }
 * Firestore documents are capped at 1 MiB, so a file (<= 5 MB) is split into 512 KiB raw chunks (~700 KB base64).
 *
 * Safety:
 *   - the declared MIME type must match the file signature (PDF / PNG / JPEG / WebP) — no polyglot "image.png" scripts;
 *   - the sha256 is recomputed on read and a mismatch refuses the download (tamper / partial-write detection);
 *   - blobs are never exposed to tenants or consumers; only platform routes guarded by `network.verification.evidence`.
 * Not done here (documented in SNET_PHASE_2_0.md): malware scanning and object-level TTL sweep of orphaned blobs.
 */
import { createHash } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const blobs = createNetworkCollection(NETWORK_COLLECTIONS.EVIDENCE_BLOBS);
const chunks = createNetworkCollection(NETWORK_COLLECTIONS.EVIDENCE_BLOB_CHUNKS);

export const EVIDENCE_CHUNK_BYTES = 512 * 1024;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

/** True when the leading bytes match the declared MIME type. */
export function signatureMatches(mimeType, bytes) {
    const b = bytes;
    if (!b || b.length < 5) return false;
    switch (mimeType) {
        case "application/pdf":
            return b.subarray(0, 5).toString("latin1") === "%PDF-";
        case "image/png":
            return b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG";
        case "image/jpeg":
            return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
        case "image/webp":
            return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
        default:
            return false;
    }
}

const chunkId = (uploadId, i) => `${uploadId}_${i}`;

/**
 * @param {{ uploadId: string, companyId: string, mimeType: string, fileName?: string|null, sha256: string }} meta
 * @param {Buffer} bytes
 */
export async function putEvidenceBlob(meta, bytes) {
    if (!meta?.uploadId || !meta?.companyId) throw err(500, "EVIDENCE_BLOB_INVALID", "uploadId and companyId are required.");
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw err(400, "FILE_EMPTY", "File is empty");
    if (bytes.length > EVIDENCE_MAX_BYTES) throw err(400, "FILE_TOO_LARGE", "File exceeds 5MB limit");
    if (!signatureMatches(meta.mimeType, bytes)) {
        throw err(415, "FILE_CONTENT_MISMATCH", "The file content does not match its declared type (PDF / PNG / JPEG / WebP).");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (meta.sha256 && meta.sha256 !== sha256) throw err(500, "EVIDENCE_BLOB_CHECKSUM", "Checksum mismatch while storing the file.");
    const count = Math.ceil(bytes.length / EVIDENCE_CHUNK_BYTES);
    for (let i = 0; i < count; i += 1) {
        const slice = bytes.subarray(i * EVIDENCE_CHUNK_BYTES, (i + 1) * EVIDENCE_CHUNK_BYTES);
        await chunks.put(chunkId(meta.uploadId, i), { uploadId: meta.uploadId, index: i, data: slice.toString("base64") }, { merge: false });
    }
    // Metadata is written last: a blob without metadata is an orphan and is never served.
    const doc = {
        uploadId: meta.uploadId,
        companyId: meta.companyId,
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
export async function getEvidenceBlobMeta(uploadId) {
    return (await blobs.get(String(uploadId || ""))) || null;
}

/**
 * Read + verify a stored file.
 * @param {string} uploadId
 * @returns {Promise<{ meta: object, bytes: Buffer }|null>} null when nothing is stored for this upload
 */
export async function readEvidenceBlob(uploadId) {
    const meta = await getEvidenceBlobMeta(uploadId);
    if (!meta) return null;
    const parts = [];
    for (let i = 0; i < meta.chunks; i += 1) {
        const row = await chunks.get(chunkId(meta.uploadId, i));
        if (!row?.data) throw err(500, "EVIDENCE_BLOB_INCOMPLETE", "Stored evidence file is incomplete.");
        parts.push(Buffer.from(row.data, "base64"));
    }
    const bytes = Buffer.concat(parts);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== meta.byteLength || sha256 !== meta.sha256) {
        throw err(500, "EVIDENCE_BLOB_CORRUPT", "Stored evidence file failed its integrity check.");
    }
    return { meta, bytes };
}

/** @param {string} uploadId */
export async function removeEvidenceBlob(uploadId) {
    const meta = await getEvidenceBlobMeta(uploadId);
    await blobs.remove(String(uploadId || ""));
    for (let i = 0; i < (meta?.chunks || 0); i += 1) await chunks.remove(chunkId(uploadId, i));
}

export function clearEvidenceBlobsForTests() {
    blobs.clearMemory();
    chunks.clearMemory();
}
