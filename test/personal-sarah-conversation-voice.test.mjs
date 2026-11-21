#!/usr/bin/env node
import assert from "node:assert/strict";

const { polishPersonalSarahReply, formatOpenWebSearchForPersonalSarah } = await import(
    "../services/sarah/personal/personalSarahConversationVoice.js"
);

const cleaned = polishPersonalSarahReply(
    "See https://news.google.com/rss/articles/foo and [BBC](https://bbc.com) according to News24."
);
assert.ok(!cleaned.includes("https://"));
assert.ok(!cleaned.includes("according to"));

const brief = formatOpenWebSearchForPersonalSarah({
    ok: true,
    query: "test",
    results: [{ title: "Coalition", snippet: "Talks continue", url: "https://example.com", source: "google_news" }],
});
assert.ok(!brief.includes("https://"));
assert.ok(!brief.includes("google_news"));
assert.ok(brief.includes("INTERNAL"));

console.log("personal-sarah-conversation-voice.test.mjs: ok");