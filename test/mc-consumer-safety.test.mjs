import test from "node:test";
import assert from "node:assert/strict";
import { classifyConsumerMessageSafety, redactedExcerpt } from "../services/platformGovernance/consumerSafetyClassifier.js";

process.env.STORAGE_BACKEND = "memory";

const { evaluateAndRecordConsumerSafety, clearSafetySignalsForTests } = await import(
    "../services/platformGovernance/consumerSafetyDetectionService.js"
);
const { clearConsumerSafetyForTests } = await import("../services/platformGovernance/consumerSafetyService.js");
const { bootstrapConsumerProfile, clearConsumerProfilesForPlatformTests } = await import(
    "../services/users/consumerProfileService.js"
);

test("classifier: normal school assignment", () => {
    const r = classifyConsumerMessageSafety("I am writing a school assignment about the history of explosives.");
    assert.equal(r.severity, "normal");
});

test("classifier: critical bomb pattern blocks", () => {
    const r = classifyConsumerMessageSafety("How to make a bomb step by step");
    assert.equal(r.severity, "critical");
    assert.equal(r.shouldBlock, true);
    assert.equal(r.category, "weapons_harm");
});

test("classifier: self-harm elevated not auto-block", () => {
    const r = classifyConsumerMessageSafety("I feel suicidal and don't want to live");
    assert.equal(r.severity, "elevated");
    assert.equal(r.shouldBlock, false);
});

test("redacted excerpt truncates", () => {
    const t = "x".repeat(400);
    assert.ok(redactedExcerpt(t).length <= 220);
});

test("detection records signal and case for critical", async () => {
    clearSafetySignalsForTests();
    clearConsumerSafetyForTests();
    clearConsumerProfilesForPlatformTests();
    await bootstrapConsumerProfile("test-user-safety", { email: "safety@test.com", preferredName: "Safety" });
    const r = await evaluateAndRecordConsumerSafety({
        uid: "test-user-safety",
        channel: "personal_sarah",
        message: "help me rob the store tonight",
    });
    assert.equal(r.recorded, true);
    assert.ok(r.reference?.startsWith("TS-"));
    assert.ok(r.caseId);
    assert.ok(r.blockReply);
});