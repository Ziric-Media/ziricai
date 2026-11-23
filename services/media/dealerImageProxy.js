/**
 * Proxy dealer stock photos for Sarah App (avoids hotlink / referrer blocks in the browser).
 */

const ALLOWED_HOST = /^(?:www\.)?(?:centralmotorsrtb|babescarsales)\.co\.za$/i;

/**
 * @param {string} url
 */
export function isAllowedDealerImageUrl(url) {
    const raw = String(url || "").trim();
    if (!/^https?:\/\//i.test(raw)) return false;
    try {
        const u = new URL(raw);
        if (!ALLOWED_HOST.test(u.hostname)) return false;
        if (!/\/wp-content\/uploads\//i.test(u.pathname)) return false;
        return /\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(u.pathname + u.search);
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 */
export async function fetchDealerImageBuffer(url) {
    if (!isAllowedDealerImageUrl(url)) {
        throw Object.assign(new Error("Image URL not allowed"), { status: 400, code: "IMAGE_URL_NOT_ALLOWED" });
    }
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Ziricai-SarahApp/1.0 (+https://ziricai.com)",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            Referer: `https://${new URL(url).hostname}/`,
        },
        redirect: "follow",
    });
    if (!res.ok) {
        throw Object.assign(new Error(`Upstream image ${res.status}`), { status: 502, code: "IMAGE_UPSTREAM_FAILED" });
    }
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
        throw Object.assign(new Error("Upstream did not return an image"), { status: 502, code: "IMAGE_NOT_IMAGE" });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
        throw Object.assign(new Error("Empty image"), { status: 502, code: "IMAGE_EMPTY" });
    }
    return { buffer, mimeType };
}
