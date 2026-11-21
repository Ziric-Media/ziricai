#!/usr/bin/env node
import assert from "node:assert/strict";

const { assertSafePublicHttpsUrl, htmlToPlainText } = await import(
    "../services/sarah/openWeb/openWebSafeFetch.js"
);
const {
    formatOpenWebSearchForModel,
    personalSarahOpenWebEnabled,
    searchOpenWeb,
} = await import("../services/sarah/openWeb/openWebSearchService.js");
const { shouldPrefetchOpenWeb } = await import("../services/sarah/personal/personalSarahOpenWebPrefetch.js");

assert.throws(() => assertSafePublicHttpsUrl("http://127.0.0.1/secret"));
assert.equal(assertSafePublicHttpsUrl("https://en.wikipedia.org/wiki/Zimbabwe"), "https://en.wikipedia.org/wiki/Zimbabwe");

const plain = htmlToPlainText("<html><head><title>Hi</title></head><body><p>Hello <b>world</b></p></body></html>");
assert.equal(plain.title, "Hi");
assert.ok(plain.text.includes("Hello world"));

assert.equal(personalSarahOpenWebEnabled(), true);
assert.equal(shouldPrefetchOpenWeb("What is the capital of France?"), true);
assert.equal(shouldPrefetchOpenWeb("What trend is building in Zimbabwe mining?"), false);

const payload = await searchOpenWeb("Platinum", { maxResults: 3 });
assert.equal(payload.ok, true);
assert.ok(formatOpenWebSearchForModel(payload).includes("Platinum"));

console.log("personal-sarah-open-web.test.mjs: ok");