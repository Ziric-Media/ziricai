/**
 * SN-03b — slot ranking, follow-topic boost, cross-slot dedupe.
 */

const STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "will",
    "have",
    "been",
    "says",
    "said",
    "after",
    "over",
    "into",
    "about",
]);

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * @param {string[]} followTopics
 * @param {{ headline?: string, summary?: string }} story
 */
export function followTopicScore(followTopics, story) {
    const topics = (followTopics || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    if (!topics.length) return 0;
    const hay = `${story.headline || ""} ${story.summary || ""}`.toLowerCase();
    let score = 0;
    for (const topic of topics) {
        if (hay.includes(topic)) score += 1;
    }
    return score;
}

/**
 * @param {object[]} stories
 * @param {{ stories?: object[] } | null} previousEdition
 */
export function applyCrossSlotDedupe(stories, previousEdition) {
    if (!previousEdition?.stories?.length) {
        return { stories, suppressed: 0, updated: 0 };
    }
    const prevById = new Map(
        previousEdition.stories.map((s) => [s.storyId, { headline: s.headline, publishedAt: s.publishedAt || 0 }])
    );
    const kept = [];
    let suppressed = 0;
    let updated = 0;
    for (const story of stories) {
        const prev = prevById.get(story.storyId);
        if (!prev) {
            kept.push(story);
            continue;
        }
        const pub = story.publishedAt || 0;
        const headlineChanged = String(story.headline || "").trim() !== String(prev.headline || "").trim();
        const newer = pub > (prev.publishedAt || 0) + 60_000;
        if (headlineChanged || newer) {
            kept.push({ ...story, storyStatus: headlineChanged ? "updated" : "developing" });
            updated += 1;
            continue;
        }
        suppressed += 1;
    }
    return { stories: kept, suppressed, updated };
}

/**
 * Backfill when dedupe thins the edition too much.
 * @param {object[]} kept
 * @param {object[]} original
 * @param {number} minCount
 */
export function backfillEditionStories(kept, original, minCount = 10) {
    if (kept.length >= minCount) return kept;
    const keptIds = new Set(kept.map((s) => s.storyId));
    for (const story of original) {
        if (kept.length >= minCount) break;
        if (!keptIds.has(story.storyId)) {
            kept.push({ ...story, storyStatus: story.storyStatus || "repeat" });
            keptIds.add(story.storyId);
        }
    }
    return kept;
}

/**
 * @param {object[]} stories
 * @param {string[]} followTopics
 * @param {{ previousCompiledAt?: string|null, slot?: string }} [opts]
 */
export function rankStoriesForSlot(stories, followTopics, opts = {}) {
    const prevMs = opts.previousCompiledAt ? Date.parse(opts.previousCompiledAt) : NaN;
    const slot = opts.slot || "morning";
    return [...stories]
        .map((s) => {
            let score = followTopicScore(followTopics, s);
            const pub = s.publishedAt || 0;
            if (slot === "lunch" && Number.isFinite(prevMs) && pub > prevMs) score += 2;
            if (slot === "evening" && Number.isFinite(prevMs) && pub > prevMs) score += 2;
            if (s.storyStatus === "updated") score += 3;
            return { story: s, score, pub };
        })
        .sort((a, b) => b.score - a.score || b.pub - a.pub)
        .map((x) => x.story);
}

/**
 * @param {{ headline?: string }} a
 * @param {{ headline?: string }} b
 */
export function storiesAreRelated(a, b) {
    if (!a?.headline || !b?.headline || a === b) return false;
    const ta = new Set(tokenize(a.headline));
    const tb = new Set(tokenize(b.headline));
    if (!ta.size || !tb.size) return false;
    let overlap = 0;
    for (const w of ta) {
        if (tb.has(w)) overlap += 1;
    }
    const minSize = Math.min(ta.size, tb.size);
    return overlap >= 2 || overlap / minSize >= 0.45;
}