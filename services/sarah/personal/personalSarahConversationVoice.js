/**
 * Personal Sarah — intimate adviser voice (no citations/links in user-facing text).
 */

export const PERSONAL_SARAH_INTIMATE_VOICE_RULES = `Personal conversation voice (every user-visible reply in Personal Sarah chat):
- Sound like a knowledgeable friend or family adviser: warm, direct, and human — not a news reader or search results page.
- Give **your take** in your own words. When the user asks for analysis or "your view", synthesise what you know into clear opinion grounded in facts.
- **Never** put URLs, https links, or "click here" in the reply.
- **Never** name news sites, publishers, Wikipedia, Google, or "the internet" as where information came from (no News24, BBC, etc.).
- **Never** write "according to", "sources say", "reports indicate", "I searched", "prefetch", or "headlines show [Publisher]".
- Tool and prefetch output is **internal research only** — absorb it; the user should feel you simply know and are advising them.
- If uncertain, say that plainly ("things are still moving", "I'd keep an eye on…") without blaming feeds or tools.
- Light Markdown lists are fine; avoid sounding like a formal report unless the user asks for structure.
- **Sponsored Recommendation** labelling still applies when showing paid placements.`;

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi;

/**
 * Last-line safety net before messages reach the PWA.
 * @param {string} text
 * @param {{ stripCitations?: boolean }} [opts]
 */
export function polishPersonalSarahReply(text, opts = {}) {
    let t = String(text || "").trim();
    if (!t) return t;

    t = t.replace(MD_LINK_RE, "$1");
    t = t.replace(URL_RE, "");

    if (opts.stripCitations !== false) {
        t = t.replace(/^\s*[-•]\s*(Source|Via|Read more|Link)\s*:.*$/gim, "");
        t = t.replace(/\baccording to [^.!?]+\b/gi, "");
        t = t.replace(/\b(as )?reported by [^.!?]+\b/gi, "");
        t = t.replace(/\b(per|via) [A-Z][A-Za-z0-9&\s]{2,40}(,|\.|$)/g, "");
    }

    t = t.replace(/\n{3,}/g, "\n\n");
    t = t.replace(/[ \t]+\n/g, "\n");
    return t.trim();
}

/**
 * @param {Awaited<ReturnType<import("../openWeb/openWebSearchService.js").searchOpenWeb>>} payload
 */
export function formatOpenWebSearchForPersonalSarah(payload) {
    if (!payload?.ok) {
        return payload?.error || "Open web search unavailable.";
    }
    if (!payload.results?.length) {
        return [
            "INTERNAL RESEARCH — no snippets matched.",
            "Answer from general knowledge with humility, or ask one clarifying question. Do not mention search tools to the user.",
        ].join("\n");
    }
    const lines = [
        "INTERNAL RESEARCH ONLY (do not quote verbatim; no URLs or outlet names in user reply):",
        `Topic: ${payload.query}`,
        "",
    ];
    for (const r of payload.results) {
        const bit = [r.title, r.snippet].filter(Boolean).join(" — ");
        lines.push(`• ${bit.slice(0, 520)}`);
    }
    lines.push("", "Synthesise into your own intimate adviser voice for the user.");
    return lines.join("\n");
}

/**
 * @param {Awaited<ReturnType<import("../openWeb/openWebSearchService.js").readOpenWebPage>>} payload
 */
export function formatOpenWebPageForPersonalSarah(payload) {
    if (!payload?.ok) return payload?.error || "Page not available.";
    return [
        "INTERNAL PAGE READ (do not cite URL or site name to the user):",
        `Title hint: ${payload.title || "unknown"}`,
        "",
        String(payload.excerpt || "").slice(0, 4500),
        "",
        "Synthesise into your personal take.",
    ].join("\n");
}

/**
 * @param {import("../news/sarahNewsIntelligenceService.js").formatSarahNewsSnapshotForModel extends (a: infer A) => any ? A : never} snap
 */
export function formatSarahNewsSnapshotForPersonalSarah(snap) {
    if (!snap?.success) return snap?.error || "No news snapshot.";
    if (!snap.headlines?.length) {
        return "INTERNAL NEWS — no matching wire items. Use open-web or general knowledge; do not tell the user the feed was empty.";
    }
    const lines = [
        "INTERNAL NEWS WIRE (no publisher names or links in user reply):",
        "",
    ];
    for (const h of snap.headlines) {
        lines.push(`• ${h.headline}${h.summary ? ` — ${h.summary}` : ""}`);
    }
    lines.push("", "Turn into conversational briefing in your own voice.");
    return lines.join("\n");
}

/**
 * @param {import("../intelligence/sarahIntelligenceRecallService.js").formatWorldContextForModel extends (a: infer A) => any ? A : never} payload
 */
export function formatWorldContextForPersonalSarah(payload) {
    if (!payload?.active) {
        return "INTERNAL MEMORY off or empty — use open web; do not mention memory tools.";
    }
    const lines = ["INTERNAL WORLD MEMORY (no timestamps or publishers in user reply):", ""];
    for (const row of payload.observations || []) {
        lines.push(`• ${row.headline}${row.summary ? ` — ${String(row.summary).slice(0, 280)}` : ""}`);
    }
    for (const tr of (payload.trends || []).slice(0, 4)) {
        lines.push(`• Trend angle: ${tr.label} — ${tr.headlineSample || tr.label}`);
    }
    lines.push("", "Blend into your take on what changed.");
    return lines.join("\n");
}