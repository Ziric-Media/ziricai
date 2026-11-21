/**
 * U2 — Personal Sarah orchestrator + reminders (memory storage).
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import { handlePersonalSarahChat } from "../services/sarah/personal/personalSarahOrchestrator.js";
import { bootstrapConsumerProfile } from "../services/users/consumerProfileService.js";
import { createPersonalReminder } from "../services/sarah/personal/personalSarahTaskStore.js";

await bootstrapConsumerProfile("u-ps-1", {
    email: "spencer@test.com",
    firstName: "Spencer",
    preferredName: "Spencer",
});

const r1 = await handlePersonalSarahChat(
    {
        uid: "u-ps-1",
        consumerProfile: { preferredName: "Spencer", firstName: "Spencer" },
    },
    { message: "Remind me to call the dentist tomorrow" }
);

assert.ok(r1.reply);
assert.ok(r1.sessionId);
assert.match(r1.reply, /Reminder saved|remind/i);

const task = await createPersonalReminder("u-ps-1", { title: "Test task", dueAt: "tomorrow 9am" });
assert.equal(task.userId, "u-ps-1");

const r2 = await handlePersonalSarahChat(
    {
        uid: "u-ps-1",
        consumerProfile: { preferredName: "Spencer" },
    },
    { message: "What did we talk about?", sessionId: r1.sessionId }
);
assert.ok(r2.sessionId === r1.sessionId);

console.log("personal-sarah-u2.test.mjs OK");
