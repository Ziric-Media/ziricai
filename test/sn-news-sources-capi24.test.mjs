#!/usr/bin/env node
import assert from "node:assert/strict";
import { fetchRssFeed } from "../services/sarah/news/sarahNewsRss.js";

const url = "https://feeds.capi24.com/v1/Search/articles/news24/southafrica/rss";
const items = await fetchRssFeed(url, { timeoutMs: 20000 });
assert.ok(items.length >= 3, `expected News24 SA items, got ${items.length}`);
assert.ok(items[0].title && items[0].link?.includes("news24.com"));
console.log("sn-news-sources-capi24.test.mjs: ok", items.length, items[0].title.slice(0, 50));