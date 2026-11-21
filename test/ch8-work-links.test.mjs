import assert from "node:assert/strict";
import { createChatWorkLink, listChatWorkLinks, clearChatWorkLinksForTests } from "../services/users/chatWorkLinkService.js";

clearChatWorkLinksForTests();
const link = createChatWorkLink("uc_test", { workItemId: "work-1", label: "Follow-up" });
assert.equal(link.workItemId, "work-1");
assert.equal(listChatWorkLinks("uc_test").length, 1);
console.log("ch8-work-links.test.mjs: ok");
