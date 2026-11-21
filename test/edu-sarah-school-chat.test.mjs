#!/usr/bin/env node
/**
 * Educare Company Sarah — tools + parent concern logging (memory).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const companyId = `educare-chat-${Date.now()}`;
const parentUid = `parent_chat_${Date.now()}`;

const { createCompany } = await import("../services/tenants/companyService.js");
const { provisionCompany } = await import("../services/platform/provisioningService.js");
const { bootstrapEducareCompanyProfile } = await import("../services/education/educareTenantBootstrap.js");
const { upsertBusinessDirectoryEntry } = await import("../services/users/businessDirectoryService.js");
const { shouldRunEducareSchoolChat } = await import("../services/education/educareIndustryPreset.js");
const {
    EDUCARE_SCHOOL_CHAT_TOOLS,
    extractEducareUiHints,
} = await import("../services/education/educareSchoolChatTools.js");
const { logParentConcern, listParentConcernsForSchool } = await import("../services/education/schoolParentConcernService.js");
const { listAdmissionsForSchool } = await import("../services/education/schoolAdmissionService.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

await createCompany(companyId, {
    name: "Educare Chat Pilot",
    industry: "Education",
    status: "active",
    ownerUid: "staff",
    settings: { education: { requireVerifiedGuardians: true, admissionsEnabled: true } },
});
await provisionCompany(companyId, {
    companyId,
    name: "Educare Chat Pilot",
    ownerUid: "staff",
    agentName: "School Sarah",
});
await bootstrapEducareCompanyProfile(companyId);
upsertBusinessDirectoryEntry(companyId, {
    companyId,
    discoverability: "public",
    displayName: "Educare Chat Pilot",
    industry: "Education",
    location: "Rustenburg",
});

assert.equal(await shouldRunEducareSchoolChat(companyId), true);

const saveTool = EDUCARE_SCHOOL_CHAT_TOOLS.find((t) => t.name === "saveEducareAdmissionFromChat");
const saved = await saveTool.execute(
    { companyId, customerId: parentUid, customerName: "Parent Test", customerPhone: "+27000000000", channel: "test" },
    {
        childFullName: "Amy Test",
        childAgeYears: 10,
        gender: "girl",
        gradeApplyingFor: "5",
        campusId: "primary",
        parentFullName: "Parent Test",
        parentMobile: "+27000000000",
        parentEmail: "parent@example.com",
    }
);
assert.equal(saved.ok, true);
assert.ok(saved.data?.applicationId);
const submitTool = EDUCARE_SCHOOL_CHAT_TOOLS.find((t) => t.name === "submitEducareAdmissionFromChat");
const submittedViaChat = await submitTool.execute(
    { companyId, customerId: parentUid, channel: "test" },
    { applicationId: saved.data.applicationId, parentConfirmedConsent: true }
);
assert.equal(submittedViaChat.ok, true);
assert.equal(extractEducareUiHints([submittedViaChat]).length, 0);

const schoolQueue = await listAdmissionsForSchool(companyId, { status: "documents_pending" });
assert.ok(schoolQueue.applications.some((a) => a.applicationId === saved.data.applicationId));

const concern = await logParentConcern(companyId, parentUid, {
    childName: "Amy Test",
    childGrade: "5",
    category: "academic",
    issue: "Homework load concern",
});
assert.match(concern.reference, /^EDU-/);

const concerns = await listParentConcernsForSchool(companyId);
assert.equal(concerns.length, 1);
assert.equal(concerns[0].childName, "Amy Test");

console.log("edu-sarah-school-chat.test.mjs: ok");