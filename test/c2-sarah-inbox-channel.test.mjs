/**
 * C2 — Sarah App channel labels + Sales inbox routing (first slice).
 */
import assert from "node:assert/strict";
import { inboxChannelLabel } from "../js/portal/modules/inbox-ui.js";
import {
    conversationSalesChannel,
    filterConversationsForSalesSection,
    salesSectionMeta,
} from "../js/portal/salesWorkspace.js";

assert.equal(inboxChannelLabel("sarah_app"), "Sarah App · Sarah Inbox");
assert.equal(inboxChannelLabel("whatsapp"), "WhatsApp");
assert.notEqual(inboxChannelLabel("sarah_app"), inboxChannelLabel("whatsapp"));

const sarahThread = { id: "sarah_app::u1", channel: "sarah_app" };
const waThread = { id: "wa::1", channel: "whatsapp" };

assert.equal(conversationSalesChannel(sarahThread), "sarah_app");
assert.equal(conversationSalesChannel(waThread), "whatsapp");

const mixed = [sarahThread, waThread, { id: "x", channel: "sarah_app" }];
const sarahOnly = filterConversationsForSalesSection(mixed, "sarah_app");
assert.equal(sarahOnly.length, 2);
assert.ok(sarahOnly.every((c) => conversationSalesChannel(c) === "sarah_app"));

const waOnly = filterConversationsForSalesSection(mixed, "whatsapp");
assert.equal(waOnly.length, 1);

assert.ok(salesSectionMeta("sarah_app").title.includes("Sarah"));

console.log("c2-sarah-inbox-channel.test.mjs: ok");
