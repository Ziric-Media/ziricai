/**
 * U5 — user ↔ company Sarah chat + tenant dual-write.
 */
process.env.STORAGE_BACKEND = 'memory';

import assert from 'node:assert/strict';
import { SMILEMORE_DEMO_COMPANY_ID } from '../services/dental/smilemorePractice.js';
import { clearUserConversationsForTests } from '../services/users/userConversationService.js';
import { clearBusinessDirectoryForTests } from '../services/users/businessDirectoryService.js';
import {
    sendCompanySarahMessage,
    getCompanyConversationForUser,
} from '../services/sarah/company/companyReceptionChatService.js';
import { listUserConversations } from '../services/users/userConversationService.js';
import { getTenantConversationHistory } from '../services/storage/tenantStorage.js';
import { executePersonalSarahTool } from '../services/sarah/personal/personalSarahTools.js';

clearUserConversationsForTests();
clearBusinessDirectoryForTests();

const uid = 'u-u5-pilot';
const profile = { preferredName: 'Alex', firstName: 'Alex' };

const opened = await getCompanyConversationForUser(uid, SMILEMORE_DEMO_COMPANY_ID, profile);
assert.ok(opened.messages.length >= 1);
assert.match(opened.messages[0].content, /welcome to/i);

const sent = await sendCompanySarahMessage(uid, SMILEMORE_DEMO_COMPANY_ID, 'Do you accept new patients?', profile);
assert.ok(sent.reply);
assert.ok(sent.messages.length >= 3);

const list = listUserConversations(uid);
assert.equal(list.length, 1);
assert.equal(list[0].companyId, SMILEMORE_DEMO_COMPANY_ID);

const tenantHistory = await getTenantConversationHistory(
    SMILEMORE_DEMO_COMPANY_ID,
    uid,
    'sarah_app',
    20,
    { externalUserId: uid }
);
assert.ok(tenantHistory.length >= 2);

const summary = await executePersonalSarahTool('summarizeCompanyConversation', { uid }, {
    companyId: SMILEMORE_DEMO_COMPANY_ID,
});
assert.equal(summary.success, true);
assert.match(summary.message, /Company Sarah|You:/);

console.log('user-conversations-u5.test.mjs: ok');
