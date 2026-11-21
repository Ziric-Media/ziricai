/**
 * SN-01 — compile a personalised headline edition from allow-listed RSS.
 */
import { createHash } from "node:crypto";
import {
    REGION_FEED_LISTS,
    INTEREST_FEED_LISTS,
    ZIMBABWE_KEYWORDS,
    SOUTH_AFRICA_KEYWORDS,
    ENC_AVAILABLE_ATTRIBUTION,
    MINING_KEYWORDS,
    SARAH_NEWS_PUBLISHER_ALLOWLIST,
} from "./sarahNewsSources.js";
import { fetchRssFeedCached } from "./sarahNewsRssCache.js";
import { decodeEntities, newsCardTeaser } from "./sarahNewsRss.js";
import {
    editionCacheKey,
    getCachedSarahNewsEdition,
    setCachedSarahNewsEdition,
} from "./sarahNewsEditionCache.js";
import { DEFAULT_SARAH_NEWS_PROFILE } from "./sarahNewsProfileService.js";
import {
    composeSarahArticleBody,
    heroImageUrl,
    storyHasPublishableDetail,
} from "./sarahNewsArticleComposer.js";
import { publisherStoryStockImage, resolveStoryImageUrl } from "./sarahNewsImageService.js";
import {
    getSarahNewsEditionSnapshot,
    previousBriefingSlot,
    saveSarahNewsEditionSnapshot,
    localDayKey,
} from "./sarahNewsEditionStore.js";
import {
    applyCrossSlotDedupe,
    backfillEditionStories,
    rankStoriesForSlot,
} from "./sarahNewsSlotPolicy.js";

function storyId(seed) {
    return `story_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export function slotForNow(date = new Date()) {
    const h = date.getHours();
    if (h < 11) return "morning";
    if (h < 16) return "lunch";
    return "evening";
}

function matchesRegionFilter(region, item, feedMeta) {
    if (feedMeta?.nativeRegion === region) return true;
    const hay = `${item.title} ${item.description}`;
    if (region === "zw") return ZIMBABWE_KEYWORDS.test(hay);
    if (region === "za") return SOUTH_AFRICA_KEYWORDS.test(hay);
    if (region === "africa") return true;
    if (region === "world") return true;
    return true;
}

function matchesInterestFilter(interest, item) {
    if (interest !== "mining") return true;
    const hay = `${item.title} ${item.description}`;
    return MINING_KEYWORDS.test(hay);
}

/**
 * @param {object} profile
 * @param {{ slot?: string, uid?: string, persistEdition?: boolean, refresh?: boolean, useCache?: boolean }} [opts]
 */
export async function compileSarahNewsEdition(profile = {}, opts = {}) {
    const merged = {
        ...DEFAULT_SARAH_NEWS_PROFILE,
        ...profile,
        regions: profile.regions?.length ? profile.regions : DEFAULT_SARAH_NEWS_PROFILE.regions,
        interests: profile.interests?.length ? profile.interests : DEFAULT_SARAH_NEWS_PROFILE.interests,
        followTopics: profile.followTopics?.length
            ? profile.followTopics
            : DEFAULT_SARAH_NEWS_PROFILE.followTopics,
    };

    const slot = opts.slot || slotForNow();
    const uid = opts.uid;
    const dayKey = localDayKey();
    const useCache = opts.useCache !== false && !opts.refresh;
    if (uid && useCache) {
        const cacheKey = editionCacheKey(uid, slot, dayKey, merged);
        const cached = getCachedSarahNewsEdition(cacheKey);
        if (cached) return cached;
    }
    let previousEdition = null;
    const prevSlot = previousBriefingSlot(slot);
    if (uid && prevSlot) {
        previousEdition = await getSarahNewsEditionSnapshot(uid, prevSlot, dayKey);
    }
    const feedMap = new Map();

    function addFeeds(list, tag) {
        for (const feed of list || []) {
            const prev = feedMap.get(feed.url);
            if (prev) prev.tags.push(tag);
            else feedMap.set(feed.url, { ...feed, tags: [tag] });
        }
    }
    for (const region of merged.regions) {
        addFeeds(REGION_FEED_LISTS[region], `region:${region}`);
    }
    for (const interest of merged.interests) {
        addFeeds(INTEREST_FEED_LISTS[interest], `interest:${interest}`);
    }

    const stories = [];
    const seenLinks = new Set();

    await Promise.all(
        [...feedMap.entries()].map(async ([url, meta]) => {
            try {
                const items = await fetchRssFeedCached(url);
                for (const item of items) {
                    if (item.link && seenLinks.has(item.link)) continue;
                    const regionTag = meta.tags.find((t) => t.startsWith("region:"))?.slice(7);
                    if (regionTag && !matchesRegionFilter(regionTag, item, meta)) continue;

                    const detail = decodeEntities(item.description || "");
                    const headline = decodeEntities(item.title || "");
                    if (
                        !storyHasPublishableDetail({
                            headline,
                            summary: detail,
                        })
                    ) {
                        continue;
                    }

                    const id = storyId(item.link || item.title);
                    const interestTag = meta.tags.find((t) => t.startsWith("interest:"))?.slice(9);
                    if (interestTag && !matchesInterestFilter(interestTag, item)) continue;

                    const summary = newsCardTeaser(detail, 200);
                    const draft = {
                        headline,
                        summary: detail,
                        region: regionTag || null,
                    };
                    const articleBody = composeSarahArticleBody(draft);
                    if (!articleBody) continue;
                    let sourceNote = `Story taken from ${meta.publisher}.`;
                    if (
                        regionTag === "za" &&
                        SOUTH_AFRICA_KEYWORDS.test(`${headline} ${detail}`) &&
                        meta.publisher !== ENC_AVAILABLE_ATTRIBUTION
                    ) {
                        sourceNote = `Story taken from ${meta.publisher}. Also widely reported by ${ENC_AVAILABLE_ATTRIBUTION} and other South African outlets.`;
                    }
                    stories.push({
                        storyId: id,
                        headline,
                        summary,
                        articleBody,
                        _rssImage: item.imageUrl,
                        link: item.link,
                        sourceNote,
                        publisher: meta.publisher,
                        region: regionTag || null,
                        interest: interestTag || null,
                        publishedAt: item.publishedAt,
                        confidence: "confirmed",
                        breaking: false,
                        storyStatus: "developing",
                    });
                    if (item.link) seenLinks.add(item.link);
                }
            } catch (err) {
                console.warn("[sarahNews] feed failed:", url, err.message);
            }
        })
    );

    let ranked = rankStoriesForSlot(stories, merged.followTopics, {
        slot,
        previousCompiledAt: previousEdition?.compiledAt,
    });

    const dedupe = applyCrossSlotDedupe(ranked, previousEdition);
    ranked = backfillEditionStories(dedupe.stories, stories, 10);

    const IMAGE_ENRICH_LIMIT = 28;
    const MAX_OG_FETCHES = 14;
    const forImages = ranked.slice(0, IMAGE_ENRICH_LIMIT);
    let ogBudget = MAX_OG_FETCHES;
    await Promise.all(
        forImages.map(async (s) => {
            const rssHero = heroImageUrl(s._rssImage);
            const fallback = publisherStoryStockImage(s.publisher, s.storyId);
            if (rssHero) {
                s.imageUrl = rssHero;
                s.imageFallback = fallback;
                delete s._rssImage;
                return;
            }
            const allowOg = ogBudget > 0;
            if (allowOg) ogBudget -= 1;
            if (allowOg && s.link) {
                s.imageUrl = await resolveStoryImageUrl(
                    { link: s.link, publisher: s.publisher, rssImage: null },
                    { allowOgFetch: true, timeoutMs: 3500 }
                );
            } else {
                s.imageUrl = fallback;
            }
            if (!s.imageUrl) {
                s.imageUrl = fallback;
            }
            s.imageFallback = publisherStoryStockImage(s.publisher, `${s.storyId}:alt`);
            delete s._rssImage;
        })
    );
    for (const s of ranked.slice(IMAGE_ENRICH_LIMIT)) {
        s.imageUrl = publisherStoryStockImage(s.publisher, s.storyId);
        s.imageFallback = publisherStoryStockImage(s.publisher, `${s.storyId}:alt`);
        delete s._rssImage;
    }

    const usedHeroUrls = new Set();
    for (const s of ranked) {
        let url = s.imageUrl;
        if (url && usedHeroUrls.has(url)) {
            url = publisherStoryStockImage(s.publisher, `${s.storyId}:dup`);
        }
        usedHeroUrls.add(url);
        s.imageUrl = url;
        if (!s.imageFallback || s.imageFallback === s.imageUrl) {
            s.imageFallback = publisherStoryStockImage(s.publisher, `${s.storyId}:fb`);
        }
    }

    const publisherVariety = new Set(ranked.map((s) => s.publisher).filter(Boolean));

    const top = ranked.slice(0, 1).map((s) => ({ ...s, breaking: false }));
    const headlines = ranked.slice(0, 28);
    const compiledAt = new Date().toISOString();
    const allFeatured = [...top, ...headlines];

    if (uid && opts.persistEdition === true) {
        await saveSarahNewsEditionSnapshot(uid, {
            slot,
            compiledAt,
            stories: allFeatured.map((s) => ({
                storyId: s.storyId,
                headline: s.headline,
                publishedAt: s.publishedAt,
                link: s.link,
            })),
        });
    }

    const edition = {
        ok: true,
        slot,
        compiledAt,
        editionDay: dayKey,
        sourcePolicy: "multi-publisher-rss-v4-reader",
        slotStats: {
            suppressedFromPriorSlot: dedupe.suppressed,
            updatedFromPriorSlot: dedupe.updated,
            priorSlot: prevSlot || null,
        },
        publishers: [...publisherVariety],
        allowlistSize: SARAH_NEWS_PUBLISHER_ALLOWLIST.length,
        disclaimer:
            "Sarah compiles in-app briefings from your chosen regions and topics across multiple media houses (SA, Zimbabwe, Africa, world, tech, and more).",
        topStories: top,
        headlines,
        storiesById: Object.fromEntries(allFeatured.map((s) => [s.storyId, s])),
    };

    if (uid && useCache) {
        setCachedSarahNewsEdition(editionCacheKey(uid, slot, dayKey, merged), edition);
    }

    const { ingestEditionIntoMemoryIfEnabled } = await import("../intelligence/sarahIntelligenceMemoryIngest.js");
    ingestEditionIntoMemoryIfEnabled(edition).catch(() => {});

    return edition;
}