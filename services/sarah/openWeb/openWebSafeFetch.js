/**
 * Personal Sarah — safe HTTPS fetch (SSRF guard, size cap).
 */

const BLOCKED_HOST_RE =
    /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|metadata\.google)/i;

/**
 * @param {string} rawUrl
 */
export function assertSafePublicHttpsUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || "").trim());
    } catch {
        throw Object.assign(new Error("Invalid URL"), { code: "URL_INVALID" });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw Object.assign(new Error("Only http(s) URLs are allowed"), { code: "URL_PROTOCOL" });
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (BLOCKED_HOST_RE.test(host) || host.endsWith(".local")) {
        throw Object.assign(new Error("URL host not allowed"), { code: "URL_BLOCKED" });
    }
    return parsed.toString();
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, maxBytes?: number, headers?: Record<string,string> }} [opts]
 */
export async function safeFetchText(url, opts = {}) {
    const safeUrl = assertSafePublicHttpsUrl(url);
    const timeoutMs = Math.min(Math.max(Number(opts.timeoutMs) || 12_000, 3_000), 25_000);
    const maxBytes = Math.min(Math.max(Number(opts.maxBytes) || 512_000, 8_000), 1_000_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(safeUrl, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ZiricAI-PersonalSarah/1.0; +https://sarah.ziricai.com)",
                Accept: "text/html, application/xhtml+xml, text/plain, application/json, */*",
                ...(opts.headers || {}),
            },
            redirect: "follow",
        });
        if (!res.ok) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { code: "HTTP_ERROR", status: res.status });
        }
        const buf = await res.arrayBuffer();
        const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
        const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        return { url: safeUrl, text, truncated: buf.byteLength > maxBytes, status: res.status };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} html
 * @param {number} [maxChars]
 */
export function htmlToPlainText(html, maxChars = 6000) {
    let t = String(html || "");
    t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
    t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
    t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    const title = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, " ").trim();
    t = t.replace(/<[^>]+>/g, " ");
    t = t
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"');
    t = t.replace(/\s+/g, " ").trim();
    if (t.length > maxChars) t = `${t.slice(0, maxChars)}…`;
    return { title, text: t };
}