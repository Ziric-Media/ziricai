#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    applyCrossSlotDedupe,
    followTopicScore,
    rankStoriesForSlot,
    storiesAreRelated,
} from "../services/sarah/news/sarahNewsSlotPolicy.js";

assert.equal(followTopicScore(["musk", "tesla"], { headline: "Elon Musk speaks at event", summary: "..." }), 1);

const pool = [
    { storyId: "a", headline: "Zimbabwe mining sector reforms announced", publishedAt: 1000 },
    { storyId: "b", headline: "South Africa markets mixed", publishedAt: 2000 },
];
const { stories, suppressed } = applyCrossSlotDedupe(pool, {
    stories: [{ storyId: "a", headline: "Zimbabwe mining sector reforms announced", publishedAt: 1000 }],
});
assert.equal(suppressed, 1);
assert.equal(stories.length, 1);
assert.equal(stories[0].storyId, "b");

const updatedPool = [
    {
        storyId: "a",
        headline: "Zimbabwe mining sector reforms pass parliament",
        publishedAt: 1000,
    },
];
const upd = applyCrossSlotDedupe(updatedPool, {
    stories: [{ storyId: "a", headline: "Zimbabwe mining sector reforms announced", publishedAt: 1000 }],
});
assert.equal(upd.stories.length, 1);
assert.equal(upd.stories[0].storyStatus, "updated");

assert.ok(
    storiesAreRelated(
        { headline: "President meets business leaders in Harare" },
        { headline: "Business leaders meet President in Harare talks" }
    )
);

const ranked = rankStoriesForSlot(
    [
        { storyId: "1", headline: "Generic world item", summary: "x", publishedAt: 1 },
        { storyId: "2", headline: "Manchester United wins", summary: "y", publishedAt: 2 },
    ],
    ["manchester united"],
    { slot: "morning" }
);
assert.equal(ranked[0].storyId, "2");

console.log("sn-news-slot-policy.test.mjs: ok");