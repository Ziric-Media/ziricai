#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildSarahNewsStoryRoom } from "../services/sarah/news/sarahNewsStoryService.js";

const story = {
    storyId: "s1",
    headline: "Major policy shift in Zimbabwe mining sector",
    summary:
        "Officials outlined new licensing rules for foreign investors. Analysts say copper and lithium projects may accelerate. Communities await clarity on revenue sharing.",
    publisher: "BBC",
    link: "https://example.com/1",
    publishedAt: Date.now() - 3600_000,
    region: "zw",
};

const edition = {
    compiledAt: new Date().toISOString(),
    headlines: [
        story,
        {
            storyId: "s2",
            headline: "Zimbabwe mining licensing rules draw investor interest",
            summary: "Markets reacted to regulatory changes.",
            publisher: "Reuters",
            link: "https://example.com/2",
        },
    ],
};

const room = buildSarahNewsStoryRoom(story, edition);
assert.ok(room.facts.length >= 2);
assert.ok(room.timeline.length >= 1);
assert.ok(room.related.length >= 1);
assert.ok(room.sources.some((s) => s.role === "primary"));
assert.ok(room.background);

console.log("sn-news-story-room.test.mjs: ok");