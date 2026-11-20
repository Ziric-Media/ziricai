/**
 * SN-02 — in-app reader copy in Sarah's voice (from RSS facts, no outbound read required).
 */

function splitSentences(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    return clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) || [clean];
}

/**
 * @param {{ headline?: string, summary?: string, region?: string|null }} story
 */
export function composeSarahArticleBody(story) {
    const headline = String(story.headline || "Today's story").trim();
    const summary = String(story.summary || "").trim();
    const sentences = splitSentences(summary);
    const lead = sentences[0] || summary || headline;
    const rest = sentences.slice(1).join(" ");

    const regionNote =
        story.region === "za"
            ? "For South African readers, I'll keep the local angle in mind as this develops."
            : story.region === "zw"
              ? "This one matters for Zimbabwe and the wider region — I'll watch for follow-up reporting."
              : "";

    const paragraphs = [
        `Here's what I'm seeing: ${lead}`,
        rest
            ? `What else is known so far: ${rest}`
            : "Publisher feeds are still thin on detail — I'll refresh when more is confirmed.",
        regionNote,
        "This briefing is Sarah's summary of verified reporting. It is not legal or financial advice; use your judgment before you act on any of it.",
    ].filter(Boolean);

    return paragraphs.join("\n\n");
}

/**
 * Prefer a wide hero from BBC thumbnail URLs.
 * @param {string|null} imageUrl
 */
export function heroImageUrl(imageUrl) {
    if (!imageUrl) return null;
    const u = String(imageUrl);
    if (u.includes("ichef.bbci.co.uk") && u.includes("/standard/240/")) {
        return u.replace("/standard/240/", "/standard/976/");
    }
    if (u.includes("ichef.bbci.co.uk") && u.includes("/240/")) {
        return u.replace("/240/", "/976/");
    }
    return u;
}