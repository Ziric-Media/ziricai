#!/usr/bin/env node
/**
 * SN-01 — RSS edition compile (network).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const { compileSarahNewsEdition } = await import("../services/sarah/news/sarahNewsEditionService.js");
const { parseRssItems } = await import("../services/sarah/news/sarahNewsRss.js");

const sample = `<?xml version="1.0"?><rss><channel><item><title>Test</title><link>https://example.com/a</link><description>Hello</description></item></channel></rss>`;
const items = parseRssItems(sample);
assert.equal(items.length, 1);
assert.equal(items[0].title, "Test");

const edition = await compileSarahNewsEdition({
    regions: ["world"],
    interests: ["business"],
});
assert.equal(edition.ok, true);
assert.ok(edition.headlines.length >= 1, "expected headlines from BBC feeds");
assert.ok(edition.headlines[0].headline);
assert.ok(edition.headlines[0].link);

console.log("sn-news-edition.test.mjs: ok", edition.headlines.length, "headlines");