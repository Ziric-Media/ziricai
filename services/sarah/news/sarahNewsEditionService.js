/**
 * SN-01 — compile a personalised headline edition from allow-listed RSS.
 */
import { createHash } from "node:crypto";
import {
    REGION_FEEDS,
    INTEREST_FEEDS,
    ZIMBABWE_KEYWORDS,
    SOUTH_AFRICA_KEYWORDS,
} from "./sarahNewsSources.js";
import { fetchRssFeed } from "./sarahNewsRss.js";
import { DEFAULT_SARAH_NEWS_PROFILE } from "./sarahNewsProfileService.js";

function storyId(seed) {
    return `story_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

function slotForNow(date = new Date()) {
    const h = date.getHours();
    if (h < 11) return "morning";
    if (h < 16) return "lunch";
    return "evening";
}

function matchesRegionFilter(region, item) {
    const hay = `${item.title} ${item.description}`;
    if (region === "zw") return ZIMBABWE_KEYWORDS.test(hay);
    if (region === "za") return SOUTH_AFRICA_KEYWORDS.test(hay);
    if (region === "africa") return true;
    if (region === "world") return true;
    return true;
}

/**
 * @param {object} profile
 * @param {{ slot?: string }} [opts]
 */
export async function compileSarahNewsEdition(profile = {}, opts = {}) {
    const merged = {
        ...DEFAULT_SARAH_NEWS_PROFILE,
        ...profile,
        regions: profile.regions?.length ? profile.regions : DEFAULT_SARAH_NEWS_PROFILE.regions,
        interests: profile.interests?.length ? profile.interests : DEFAULT_SARAH_NEWS_PROFILE.interests,
    };

    const slot = opts.slot || slotForNow();
    const feedMap = new Map();

    for (const region of merged.regions) {
        const feed = REGION_FEEDS[region];
        if (feed) feedMap.set(feed.url, { ...feed, tags: [`region:${region}`] });
    }
    for (const interest of merged.interests) {
        const feed = INTEREST_FEEDS[interest];
        if (feed) {
            const prev = feedMap.get(feed.url);
            if (prev) prev.tags.push(`interest:${interest}`);
            else feedMap.set(feed.url, { ...feed, tags: [`interest:${interest}`] });
        }
    }

    const stories = [];
    const seenLinks = new Set();

    await Promise.all(
        [...feedMap.entries()].map(async ([url, meta]) => {
            try {
                const items = await fetchRssFeed(url);
                for (const item of items) {
                    if (item.link && seenLinks.has(item.link)) continue;
                    const regionTag = meta.tags.find((t) => t.startsWith("region:"))?.slice(7);
                    if (regionTag && !matchesRegionFilter(regionTag, item)) continue;

                    const id = storyId(item.link || item.title);
                    const interestTag = meta.tags.find((t) => t.startsWith("interest:"))?.slice(9);
                    stories.push({
                        storyId: id,
                        headline: item.title,
                        summary: item.description || "Tap to read more at the publisher.",
                        link: item.link,
                        publisher: meta.publisher,
                        region: regionTag || null,
                        interest: interestTag || null,
                        publishedAt: item.publishedAt,
                        confidence: "confirmed",
                        breaking: false,
                    });
                    if (item.link) seenLinks.add(item.link);
                }
            } catch (err) {
                console.warn("[sarahNews] feed failed:", url, err.message);
            }
        })
    );

    stories.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

    const top = stories.slice(0, 1).map((s) => ({ ...s, breaking: false }));
    const headlines = stories.slice(0, 18);

    return {
        ok: true,
        slot,
        compiledAt: new Date().toISOString(),
        sourcePolicy: "bbc-rss-v1",
        disclaimer: "Headlines and summaries from publisher RSS feeds. Tap a story for the original article.",
        topStories: top,
        headlines,
        storiesById: Object.fromEntries([...top, ...headlines].map((s) => [s.storyId, s])),
    };
}