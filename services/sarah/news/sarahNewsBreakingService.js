/**
 * SN-04 — conservative breaking detection (RSS edition, MVP).
 */
import { storiesAreRelated } from "./sarahNewsSlotPolicy.js";
import { compileSarahNewsEdition } from "./sarahNewsEditionService.js";
import { DEFAULT_SARAH_NEWS_PROFILE } from "./sarahNewsProfileService.js";

const BREAKING_SIGNAL = /\b(breaking|just in|urgent|developing story|state of emergency|major explosion|earthquake|assassinated|killed in|mass shooting)\b/i;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

let cache = { at: 0, items: [] };

function storyRelevanceForProfile(story, profile) {
    const regions = profile?.regions || [];
    if (story.region && regions.includes(story.region)) return true;
    if (regions.includes("world") && (story.region === "world" || !story.region)) return true;
    if (regions.includes("africa") && story.region === "africa") return true;
    return !story.region;
}

/**
 * @param {object} edition
 */
export function detectBreakingInEdition(edition) {
    const pool = [...(edition?.topStories || []), ...(edition?.headlines || [])];
    const candidates = [];
    const seen = new Set();
    for (const story of pool) {
        if (!story?.storyId || seen.has(story.storyId)) continue;
        const hay = `${story.headline || ""} ${story.summary || ""}`;
        if (!BREAKING_SIGNAL.test(hay)) continue;
        const pub = story.publishedAt || 0;
        if (pub && Date.now() - pub > MAX_AGE_MS) continue;
        let sourceCount = 1;
        for (const other of pool) {
            if (other.storyId === story.storyId) continue;
            if (other.publisher !== story.publisher && storiesAreRelated(story, other)) sourceCount += 1;
        }
        const confidence = sourceCount >= 2 ? "verified" : BREAKING_SIGNAL.test(story.headline || "") ? "developing" : "low";
        if (confidence === "low") continue;
        seen.add(story.storyId);
        candidates.push({
            storyId: story.storyId,
            headline: story.headline,
            summary: story.summary,
            publisher: story.publisher,
            region: story.region,
            confidence,
            sourceCount,
            publishedAt: story.publishedAt,
        });
    }
    candidates.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return candidates.slice(0, 5);
}

export async function getGlobalBreakingCandidates() {
    if (Date.now() - cache.at < 5 * 60_000 && cache.items.length) return cache.items;
    const edition = await compileSarahNewsEdition(
        { regions: DEFAULT_SARAH_NEWS_PROFILE.regions, interests: ["shorts", "business", "politics"] },
        { useCache: true, persistEdition: false }
    );
    const items = detectBreakingInEdition(edition);
    cache = { at: Date.now(), items };
    return items;
}

/**
 * @param {object} profile
 */
export async function breakingAlertsForProfile(profile) {
    if (!profile?.breaking) return [];
    const all = await getGlobalBreakingCandidates();
    return all.filter((item) => storyRelevanceForProfile(item, profile));
}

export function clearSarahNewsBreakingCacheForTests() {
    cache = { at: 0, items: [] };
}