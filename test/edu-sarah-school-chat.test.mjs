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
const {
    createAdmissionDraft,
    submitAdmissionApplication,
    listAdmissionsForSchool,
} = await import("../services/education/schoolAdmissionService.js");

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

const openTool = EDUCARE_SCHOOL_CHAT_TOOLS.find((t) => t.name === "openEducareAdmissionForm");
const opened = await openTool.execute({ companyId, customerId: parentUid, channel: "test" }, { gradeHint: "5" });
assert.equal(opened.ok, true);
const hints = extractEducareUiHints([opened]);
assert.equal(hints.length, 1);
assert.equal(hints[0].action, "openEducareAdmissionForm");

const draft = await createAdmissionDraft(companyId, parentUid, {
    academicYear: String(new Date().getFullYear() + 1),
    gradeApplyingFor: "5",
    campusId: "primary",
    learner: { legalFirstName: "Amy", legalSurname: "Test", dateOfBirth: "2015-06-01" },
    guardian: { fullName: "Parent Test", mobile: "+27000000000", email: "parent@example.com" },
});
const submitted = await submitAdmissionApplication(companyId, parentUid, draft.applicationId, { consent: true });
assert.equal(submitted.status, "documents_pending");

const schoolQueue = await listAdmissionsForSchool(companyId, { status: "documents_pending" });
assert.ok(schoolQueue.applications.some((a) => a.applicationId === draft.applicationId));

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