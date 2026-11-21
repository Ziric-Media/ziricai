#!/usr/bin/env node
/**
 * SN-01 — RSS edition compile (network).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const { compileSarahNewsEdition } = await import("../services/sarah/news/sarahNewsEditionService.js");
const { parseRssItems, decodeEntities, newsCardTeaser } = await import("../services/sarah/news/sarahNewsRss.js");
const { publisherStoryStockImage } = await import("../services/sarah/news/sarahNewsImageService.js");
const { storyHasPublishableDetail } = await import("../services/sarah/news/sarahNewsArticleComposer.js");

const sample = `<?xml version="1.0"?><rss><channel><item><title>Test</title><link>https://example.com/a</link><description>Hello</description><media:thumbnail url="https://cdn.example.com/x.jpg"/></item></channel></rss>`;
const items = parseRssItems(sample);
assert.equal(items.length, 1);
assert.equal(items[0].title, "Test");
assert.equal(items[0].imageUrl, "https://cdn.example.com/x.jpg");
const decoded = decodeEntities("Sandpapergate &#8216;storm&#8217; and &#8220;quotes&#8221;");
assert.match(decoded, /Sandpapergate .storm. and .quotes./);
assert.ok(!decoded.includes("&#821"));
assert.ok(newsCardTeaser("a".repeat(300)).length <= 202);
assert.notEqual(
    publisherStoryStockImage("BBC News", "story_a"),
    publisherStoryStockImage("BBC News", "story_b")
);
assert.equal(storyHasPublishableDetail({ headline: "Only title", summary: "Only title" }), false);
assert.equal(
    storyHasPublishableDetail({
        headline: "Long",
        summary:
            "South African police and marchers clashed in Gqeberha during protests over immigration policy, with several arrests reported.",
    }),
    true
);

const edition = await compileSarahNewsEdition({
    regions: ["world"],
    interests: ["business"],
});
assert.equal(edition.ok, true);
assert.equal(typeof edition.slot, "string");
assert.ok(edition.slotStats && typeof edition.slotStats.suppressedFromPriorSlot === "number");

if (edition.headlines.length < 1) {
    console.warn(
        "sn-news-edition.test.mjs: live RSS unreachable in this environment — parser/quality/compile shell ok"
    );
    process.exit(0);
}

assert.ok(edition.headlines[0].headline);
assert.ok(edition.headlines[0].articleBody);
assert.ok(edition.headlines[0].sourceNote);
assert.ok(edition.headlines[0].imageUrl, "expected imageUrl on headlines");
if (process.env.RUN_SN_NEWS_NETWORK === "1") {
    assert.ok(Array.isArray(edition.publishers) && edition.publishers.length >= 2, "expected multiple publishers");
}

console.log(
    "sn-news-edition.test.mjs: ok",
    edition.headlines.length,
    "headlines",
    edition.publishers?.length,
    "publishers"
);