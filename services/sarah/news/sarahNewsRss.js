/**
 * SN-01 — minimal RSS 2.0 item parse (no external deps).
 */

function decodeEntities(text) {
    return String(text || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function pickTag(block, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const m = block.match(re);
    return m ? decodeEntities(m[1]) : "";
}

function pickAttr(block, tag, attr) {
    const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i");
    const m = block.match(re);
    return m ? decodeEntities(m[1]) : "";
}

function pickAttrHref(block, tag) {
    return pickAttr(block, tag, "url") || pickAttr(block, tag, "href");
}

function pickFirstImageUrl(block) {
    const thumb = pickAttr(block, "media:thumbnail", "url");
    if (thumb) return thumb;
    const itunes = pickAttrHref(block, "itunes:image");
    if (itunes) return itunes;
    const enclosure = pickAttr(block, "enclosure", "url");
    if (enclosure && /\.(jpe?g|png|webp|gif)/i.test(enclosure)) return enclosure;
    const mediaContent = block.match(/<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/gi);
    if (mediaContent) {
        for (const tag of mediaContent) {
            if (/image|jpeg|jpg|png|webp/i.test(tag)) {
                const u = tag.match(/\burl=["']([^"']+)["']/i)?.[1];
                if (u) return decodeEntities(u);
            }
        }
    }
    const imgInBlock = block.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgInBlock?.[1]) return decodeEntities(imgInBlock[1]);
    return null;
}

/**
 * @param {string} xml
 */
export function parseRssItems(xml) {
    const items = [];
    const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) && items.length < 40) {
        const block = m[1];
        const title = pickTag(block, "title");
        const link = pickTag(block, "link");
        let description = pickTag(block, "description");
        const encoded = pickTag(block, "content:encoded");
        if (encoded.length > description.length) description = encoded;
        const summary = pickTag(block, "summary");
        if (summary.length > description.length) description = summary;
        const pubDate = pickTag(block, "pubDate");
        if (!title) continue;
        items.push({
            title,
            link: link || null,
            description: description.slice(0, 2400),
            imageUrl: pickFirstImageUrl(block),
            pubDate: pubDate || null,
            publishedAt: pubDate ? Date.parse(pubDate) : null,
        });
    }
    return items;
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function fetchRssFeed(url, opts = {}) {
    const timeoutMs = Math.min(Math.max(Number(opts.timeoutMs) || 12000, 3000), 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ZiricAI-SarahNews/1.0 (+https://sarah.ziricai.com)" },
        });
        if (!res.ok) {
            throw Object.assign(new Error(`Feed HTTP ${res.status}`), { status: res.status });
        }
        const text = await res.text();
        return parseRssItems(text);
    } finally {
        clearTimeout(timer);
    }
}