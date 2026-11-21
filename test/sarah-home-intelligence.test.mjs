process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import { getSarahHomeCards } from "../services/sarah/home/sarahHomeIntelligenceService.js";
import { setSarahNewsProfile } from "../services/sarah/news/sarahNewsProfileService.js";
import { bootstrapConsumerProfile } from "../services/users/consumerProfileService.js";

const uid = "u-shi-1";

await bootstrapConsumerProfile(uid, {
    firstName: "Spencer",
    lastName: "Gore",
    preferredName: "Spencer",
    city: "Johannesburg",
    country: "ZA",
});

await setSarahNewsProfile(uid, {
    regions: ["world"],
    interests: ["business"],
    briefings: { morning: true, lunch: true, evening: true },
    breaking: false,
});

const chat = await getSarahHomeCards(uid, { mode: "chat" });
assert.ok(chat.cards.length <= 4);
assert.ok(chat.greeting);
assert.equal(chat.mode, "chat");
assert.ok(chat.cards.some((c) => c.id === "onboard_meet_sarah") || chat.cards.length >= 1);

const work = await getSarahHomeCards(uid, { mode: "work" });
assert.equal(work.mode, "work");
assert.ok(work.cards.some((c) => c.id === "work_new"));

const dismissed = await getSarahHomeCards(uid, { mode: "chat", dismissedCardIds: ["chat_insights"] });
assert.ok(!dismissed.cards.some((c) => c.id === "chat_insights"));

const withNews = await getSarahHomeCards(uid, { mode: "chat" });
assert.equal(withNews.signals?.newsConfigured, true);
const newsCard = [...withNews.cards, ...(withNews.moreCards || [])].find((c) =>
    String(c.id || "").startsWith("news_")
);
assert.ok(newsCard, "expected a Sarah News home card when news profile is set");

console.log("sarah-home-intelligence.test.mjs: ok", newsCard.id);
