/**
 * Phase 2.1 — optional malware scan hook for verification evidence bytes.
 * CLAMAV_HOST is recognised but not wired to a live scanner in this MVP (no-op, documented).
 */
export const EVIDENCE_ALLOWED_MIMES = Object.freeze(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function assertAllowedEvidenceMime(mimeType) {
    const m = String(mimeType || "").toLowerCase();
    if (!EVIDENCE_ALLOWED_MIMES.includes(m)) {
        const err = Object.assign(new Error(`File type not allowed. Use: ${EVIDENCE_ALLOWED_MIMES.join(", ")}`), {
            status: 415,
            code: "UPLOAD_TYPE_NOT_ALLOWED",
        });
        throw err;
    }
}

/**
 * @param {Buffer} bytes
 * @param {{ mimeType?: string }} [meta]
 * @returns {Promise<{ clean: boolean, scanned: boolean, engine: string }>}
 */
export async function scanEvidenceBytes(bytes, meta = {}) {
    if (meta.mimeType) assertAllowedEvidenceMime(meta.mimeType);
    if (!Buffer.isBuffer(bytes) || !bytes.length) {
        const err = Object.assign(new Error("File is empty"), { status: 400, code: "FILE_EMPTY" });
        throw err;
    }
    const host = String(process.env.CLAMAV_HOST || "").trim();
    if (host) {
        // Placeholder: production can attach clamd TCP here; env set → audited intent without blocking uploads.
        return { clean: true, scanned: false, engine: "clamav-noop" };
    }
    return { clean: true, scanned: false, engine: "none" };
}
