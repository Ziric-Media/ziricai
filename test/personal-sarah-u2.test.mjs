/**
 * U2 — Personal Sarah orchestrator + reminders (memory storage).
 */
process.env.STORAGE_BACKEND = "memory";
process.env.RS02_CONSUMER_SKU = process.env.RS02_CONSUMER_SKU || "rs02.sarah.plus.zar.monthly";

import assert from "node:assert/strict";
import { handlePersonalSarahChat } from "../services/sarah/personal/personalSarahOrchestrator.js";
import { bootstrapConsumerProfile } from "../services/users/consumerProfileService.js";
import {
    createPersonalReminder,
    createPersonalSarahTask,
    updatePersonalSarahTask,
    listPersonalSarahTasks,
} from "../services/sarah/personal/personalSarahTaskStore.js";
import { schedulePersonalTaskReminderNotifications } from "../services/sarah/personal/personalSarahTaskReminders.js";
import { deliverDuePersonalReminders } from "../services/sarah/personal/personalSarahReminderDelivery.js";

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

const prep = await createPersonalSarahTask("u-ps-1", {
    title: "Interview prep",
    taskKind: "preparation",
    categoryId: "preparation",
    taskType: "interview",
    checklist: [{ label: "Print CV", done: false }],
});
assert.equal(prep.taskKind, "preparation");
const patched = await updatePersonalSarahTask("u-ps-1", prep.id, {
    checklist: [{ label: "Print CV", done: true }],
});
assert.equal(patched.progress, 100);
const listed = await listPersonalSarahTasks("u-ps-1", { limit: 10 });
assert.ok(listed.length >= 2);

const cancelled = await updatePersonalSarahTask("u-ps-1", prep.id, { status: "cancelled" });
assert.equal(cancelled.status, "cancelled");

const meet = await createPersonalSarahTask("u-ps-1", {
    title: "Board meeting",
    taskKind: "reminder",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    reminderSchedule: [
        { label: "30 min before", at: new Date(Date.now() + 86400000 - 30 * 60000).toISOString() },
    ],
});
const sched = await schedulePersonalTaskReminderNotifications("u-ps-1", meet);
assert.ok(sched.scheduled >= 1);

const dueSoon = await createPersonalSarahTask("u-ps-1", {
    title: "Slot test",
    taskKind: "reminder",
    status: "scheduled",
    dueAt: new Date(Date.now() + 120000).toISOString(),
    reminderSchedule: [{ label: "now", at: new Date(Date.now() - 1000).toISOString() }],
});
const delivered = await deliverDuePersonalReminders("u-ps-1");
assert.ok(delivered.delivered >= 1);
assert.ok(delivered.items.some((i) => String(i.id).startsWith(dueSoon.id)));

const r2 = await handlePersonalSarahChat(
    {
        uid: "u-ps-1",
        consumerProfile: { preferredName: "Spencer" },
    },
    { message: "What did we talk about?", sessionId: r1.sessionId }
);
assert.ok(r2.sessionId === r1.sessionId);

console.log("personal-sarah-u2.test.mjs OK");
