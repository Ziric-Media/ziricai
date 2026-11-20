#!/usr/bin/env node
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const { setSarahNewsProfile } = await import("../services/sarah/news/sarahNewsProfileService.js");
const { executePersonalSarahNewsTool } = await import("../services/sarah/personal/personalSarahNewsTools.js");

const uid = "test-user-news-tool";
await setSarahNewsProfile(uid, {
    regions: ["world"],
    interests: ["tech"],
    briefings: { morning: true, lunch: true, evening: true },
});

const res = await executePersonalSarahNewsTool("fetchSarahNewsHeadlines", { uid }, { maxItems: 3 });
assert.equal(res.success, true, res.error);
assert.ok(res.data?.headlines?.length >= 1);
assert.ok(res.message.includes(res.data.headlines[0].publisher || "Source"));

const follow = await executePersonalSarahNewsTool("followSarahNewsTopic", { uid }, { topic: "Zimbabwe mining" });
assert.equal(follow.success, true);
assert.ok(follow.data.followTopics.includes("Zimbabwe mining"));

const unfollow = await executePersonalSarahNewsTool("unfollowSarahNewsTopic", { uid }, { topic: "Zimbabwe mining" });
assert.equal(unfollow.success, true);
assert.ok(!unfollow.data.followTopics.includes("Zimbabwe mining"));

console.log("personal-sarah-news-tool.test.mjs: ok", res.data.headlines.length, "headlines");