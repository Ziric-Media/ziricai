import assert from "node:assert/strict";
import {
    loadFounderCompanyIdentityProfile,
    buildFounderCompanyIdentityBriefBlock,
    userExplicitlyAsksFounderDetail,
} from "../services/sarah/knowledge/founderCompanyIdentity.js";
import { buildPersonalSarahSystemPrompt } from "../services/sarah/personal/personalSarahContext.js";

const profile = loadFounderCompanyIdentityProfile();
assert.equal(profile.founder.name, "Spencer Gore");
assert.equal(profile.sarahIdentity.whoIsSarah.toLowerCase().includes("ziricai"), true);
assert.ok(profile.canonicalAnswers.who_created_you.includes("Spencer Gore"));

const brief = buildFounderCompanyIdentityBriefBlock();
assert.ok(brief.includes("Spencer Gore"));
assert.ok(brief.includes("ZiricAI"));

assert.equal(userExplicitlyAsksFounderDetail("Who created you?"), true);
assert.equal(userExplicitlyAsksFounderDetail("Who is the founder of your company?"), true);
assert.equal(userExplicitlyAsksFounderDetail("Tell me about your founder"), true);
assert.equal(userExplicitlyAsksFounderDetail("What's the weather?"), false);

const prompt = buildPersonalSarahSystemPrompt({
    preferredName: "Sam",
    knowledgeDigest: null,
});
assert.ok(prompt.includes("Spencer Gore"));
assert.ok(prompt.includes("Founder & company identity"));
assert.ok(prompt.includes("Do not refuse those as"));
assert.ok(brief.includes(profile.canonicalAnswers.tell_me_about_your_founder.slice(0, 30)));

console.log("founder-company-identity.test.mjs OK");
