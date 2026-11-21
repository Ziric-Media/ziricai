/**
 * Personal Sarah — open web search (Wikipedia, DuckDuckGo instant answers, optional Brave).
 */
import { htmlToPlainText, safeFetchText } from "./openWebSafeFetch.js";

export function personalSarahOpenWebEnabled() {
    return String(process.env.PERSONAL_SARAH_OPEN_WEB_ENABLED || "true").toLowerCase() !== "false";
}

async function fetchJson(url, timeoutMs = 12_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ZiricAI-PersonalSarah/1.0)",
                Accept: "application/json",
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} query
 */
async function searchWikipedia(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&origin=*`;
    const searchData = await fetchJson(searchUrl);
    const hits = searchData?.query?.search || [];
    if (!hits.length) return [];

    const pageIds = hits.map((h) => h.pageid).join("|");
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${pageIds}&format=json&origin=*`;
    const extractData = await fetchJson(extractUrl);
    const pages = extractData?.query?.pages || {};

    return hits.map((h) => {
        const page = pages[String(h.pageid)] || {};
        return {
            source: "wikipedia",
            title: page.title || h.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title || h.title).replace(/ /g, "_"))}`,
            snippet: String(page.extract || h.snippet || "")
                .replace(/<[^>]+>/g, "")
                .slice(0, 900),
        };
    });
}

/**
 * @param {string} query
 */
async function searchDuckDuckGoInstant(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&skip_disambig=1`;
    const data = await fetchJson(url);
    const rows = [];
    if (data?.AbstractText) {
        rows.push({
            source: "duckduckgo",
            title: data.Heading || q,
            url: data.AbstractURL || null,
            snippet: String(data.AbstractText).slice(0, 900),
        });
    }
    const related = (data?.RelatedTopics || []).slice(0, 4);
    for (const item of related) {
        if (item?.Text) {
            rows.push({
                source: "duckduckgo",
                title: String(item.Text).slice(0, 120),
                url: item.FirstURL || null,
                snippet: String(item.Text).slice(0, 400),
            });
        }
    }
    return rows;
}

/**
 * @param {string} query
 */
async function searchBraveWeb(query) {
    const key = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
    if (!key) return [];
    const q = String(query || "").trim();
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": key,
            },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data?.web?.results || []).slice(0, 5).map((r) => ({
            source: "brave",
            title: r.title,
            url: r.url,
            snippet: String(r.description || "").slice(0, 500),
        }));
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} query
 * @param {{ maxResults?: number }} [opts]
 */
export async function searchOpenWeb(query, opts = {}) {
    if (!personalSarahOpenWebEnabled()) {
        return { ok: false, active: false, error: "Open web search is disabled on this server." };
    }
    const q = String(query || "").trim();
    if (!q) {
        return { ok: false, active: true, error: "query is required" };
    }
    const maxResults = Math.min(Math.max(Number(opts.maxResults) || 6, 1), 10);

    const [brave, wiki, ddg] = await Promise.all([
        searchBraveWeb(q).catch(() => []),
        searchWikipedia(q).catch(() => []),
        searchDuckDuckGoInstant(q).catch(() => []),
    ]);

    const merged = [];
    const seen = new Set();
    for (const row of [...brave, ...wiki, ...ddg]) {
        const key = `${row.title}|${row.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
        if (merged.length >= maxResults) break;
    }

    return {
        ok: true,
        active: true,
        query: q,
        resultCount: merged.length,
        results: merged,
        providers: {
            brave: brave.length > 0,
            wikipedia: wiki.length > 0,
            duckduckgo: ddg.length > 0,
        },
    };
}

/**
 * @param {Awaited<ReturnType<typeof searchOpenWeb>>} payload
 */
export function formatOpenWebSearchForModel(payload) {
    if (!payload?.ok) {
        return payload?.error || "Open web search failed.";
    }
    if (!payload.results?.length) {
        return `No open-web snippets found for "${payload.query}". Try rephrasing, or use fetchSarahNewsHeadlines for current news.`;
    }
    const lines = [
        `Open web search for "${payload.query}" (summarise in your own words; cite source titles/URLs; note results may be incomplete):`,
        "",
    ];
    for (const r of payload.results) {
        lines.push(`• **${r.title}** (${r.source})`);
        if (r.url) lines.push(`  ${r.url}`);
        if (r.snippet) lines.push(`  ${r.snippet.slice(0, 420)}`);
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * @param {string} url
 */
export async function readOpenWebPage(url) {
    if (!personalSarahOpenWebEnabled()) {
        return { ok: false, active: false, error: "Open web is disabled on this server." };
    }
    const { text, truncated, url: finalUrl, status } = await safeFetchText(url, { maxBytes: 400_000 });
    const { title, text: plain } = htmlToPlainText(text, 5000);
    return {
        ok: true,
        active: true,
        url: finalUrl,
        status,
        title,
        excerpt: plain,
        truncated,
    };
}

/**
 * @param {Awaited<ReturnType<typeof readOpenWebPage>>} payload
 */
export function formatOpenWebPageForModel(payload) {
    if (!payload?.ok) return payload?.error || "Could not read page.";
    const lines = [
        `Page: ${payload.title || "(no title)"}`,
        payload.url,
        "",
        String(payload.excerpt || "").slice(0, 4500),
    ];
    if (payload.truncated) lines.push("", "(page text was truncated for size)");
    return lines.join("\n");
}