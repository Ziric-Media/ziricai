/**
 * SN-04 — story images: RSS, og:image fallback, publisher stock art.
 */

const PUBLISHER_STOCK_IMAGES = Object.freeze({
    "TechCrunch": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop",
    "The Verge": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop",
    "BBC News": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop",
    "BBC Sport": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop",
    CNN: "https://images.unsplash.com/photo-1586339949916-3e9457bef6f3?w=800&auto=format&fit=crop",
    "SABC News": "https://images.unsplash.com/photo-1529107386315-d1f67428c3d5?w=800&auto=format&fit=crop",
    IOL: "https://images.unsplash.com/photo-1529107386315-d1f67428c3d5?w=800&auto=format&fit=crop",
    "Daily Maverick": "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&auto=format&fit=crop",
    "ZBC News": "https://images.unsplash.com/photo-1526304640581-334ff57c57c4?w=800&auto=format&fit=crop",
    Africanews: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&auto=format&fit=crop",
    default: "https://images.unsplash.com/photo-1495020689066-aaa043865bcc?w=800&auto=format&fit=crop",
});

/** @type {Map<string, string|null>} */
const ogImageCache = new Map();

function decodeEntities(text) {
    return String(text || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
}

/**
 * @param {string} pageUrl
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function fetchOgImageFromPage(pageUrl, opts = {}) {
    const key = String(pageUrl || "").trim();
    if (!key) return null;
    if (ogImageCache.has(key)) return ogImageCache.get(key);

    const controller = new AbortController();
    const timeoutMs = Math.min(Math.max(Number(opts.timeoutMs) || 4500, 2000), 8000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let image = null;
    try {
        const res = await fetch(key, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "User-Agent": "ZiricAI-SarahNews/1.0 (+https://sarah.ziricai.com)",
                Accept: "text/html,application/xhtml+xml",
            },
        });
        if (!res.ok) {
            ogImageCache.set(key, null);
            return null;
        }
        const reader = res.body?.getReader?.();
        if (!reader) {
            const html = (await res.text()).slice(0, 150000);
            image = extractOgFromHtml(html);
        } else {
            const decoder = new TextDecoder();
            let html = "";
            while (html.length < 150000) {
                const { done, value } = await reader.read();
                if (done) break;
                html += decoder.decode(value, { stream: true });
                if (/og:image|twitter:image/i.test(html)) break;
            }
            image = extractOgFromHtml(html);
        }
    } catch {
        image = null;
    } finally {
        clearTimeout(timer);
    }
    ogImageCache.set(key, image);
    return image;
}

function extractOgFromHtml(html) {
    const m =
        html.match(/property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:image(?::url)?["']/i) ||
        html.match(/name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["'][^>]*name=["']twitter:image/i);
    if (!m?.[1]) return null;
    const url = decodeEntities(m[1]);
    return /^https?:\/\//i.test(url) ? url : null;
}

export function publisherStockImage(publisher) {
    const key = String(publisher || "").trim();
    return PUBLISHER_STOCK_IMAGES[key] || PUBLISHER_STOCK_IMAGES.default;
}

/**
 * @param {{ link?: string|null, publisher?: string, rssImage?: string|null }} input
 * @param {{ allowOgFetch?: boolean }} [opts]
 */
export async function resolveStoryImageUrl(input, opts = {}) {
    const rss = String(input.rssImage || "").trim();
    if (rss && /^https?:\/\//i.test(rss)) return rss;

    const link = String(input.link || "").trim();
    if (opts.allowOgFetch !== false && link) {
        const og = await fetchOgImageFromPage(link, { timeoutMs: opts.timeoutMs });
        if (og) return og;
    }
    return publisherStockImage(input.publisher);
}

export function clearSarahNewsImageCacheForTests() {
    ogImageCache.clear();
}