#!/usr/bin/env node
import assert from "node:assert/strict";

const { resolvePersonalSarahUserLocale, enrichQueryWithUserLocale } = await import(
    "../services/sarah/personal/personalSarahUserLocale.js"
);
const { shouldPrefetchLocalAffairs, recentUserConversationBlob } = await import(
    "../services/sarah/personal/personalSarahLocalAffairsPrefetch.js"
);

const loc = resolvePersonalSarahUserLocale({ country: "South Africa", city: "Johannesburg", locale: "en-ZA" });
assert.equal(loc.country, "South Africa");
assert.equal(loc.googleNewsGl, "ZA");

const q = enrichQueryWithUserLocale("coalition talks after local elections", loc);
assert.ok(q.toLowerCase().includes("south africa"));

const hist = [{ role: "user", content: "Tell me about coalition talks after local government elections" }];
assert.equal(shouldPrefetchLocalAffairs("I mean here in South Africa", hist, { country: "South Africa" }), true);

const blob = recentUserConversationBlob(hist, "I mean in politics");
assert.ok(blob.toLowerCase().includes("coalition"));

console.log("personal-sarah-local-affairs.test.mjs: ok");