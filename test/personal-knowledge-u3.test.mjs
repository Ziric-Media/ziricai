process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import {
    upsertKnowledgeSection,
    buildPersonalKnowledgeDigest,
    listKnowledgeSections,
} from "../services/users/personalKnowledgeService.js";
import { buildPersonalSarahContext } from "../services/sarah/personal/personalSarahContext.js";

await upsertKnowledgeSection("u-k1", "career", {
    content: "Software engineer, 5 years experience",
    sarahMayUse: true,
});
await upsertKnowledgeSection("u-k1", "health", {
    content: "Private health note",
    sarahMayUse: false,
});

const digest = await buildPersonalKnowledgeDigest("u-k1");
assert.ok(digest.includes("Career"));
assert.ok(!digest.includes("Private health"));

const ctx = await buildPersonalSarahContext({
    uid: "u-k1",
    consumerProfile: { preferredName: "Sam" },
});
assert.ok(ctx.knowledgeDigest.includes("Software engineer"));

const all = await listKnowledgeSections("u-k1");
assert.equal(all.length, 10);

console.log("personal-knowledge-u3.test.mjs OK");
