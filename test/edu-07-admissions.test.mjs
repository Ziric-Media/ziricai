#!/usr/bin/env node
/**
 * EDU-07 — admission application lifecycle (memory backend).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const companyId = `educare-adm-${Date.now()}`;
const parentUid = `parent_adm_${Date.now()}`;
const parentB = `parent_other_${Date.now()}`;
const staffUid = `staff_${Date.now()}`;

const { createCompany } = await import("../services/tenants/companyService.js");
const { provisionCompany } = await import("../services/platform/provisioningService.js");
const { bootstrapEducareCompanyProfile } = await import("../services/education/educareTenantBootstrap.js");
const {
    createAdmissionDraft,
    updateAdmissionDraft,
    submitAdmissionApplication,
    getAdmissionForParent,
    listAdmissionsForSchool,
    staffTransitionAdmission,
    staffRecordAdmissionDecision,
} = await import("../services/education/schoolAdmissionService.js");
const { ADMISSION_STATUS } = await import("../services/education/educareAdmissionConfig.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

await createCompany(companyId, {
    name: "Admissions Test School",
    industry: "Education",
    ownerUid: staffUid,
    settings: { education: { requireVerifiedGuardians: true, admissionsEnabled: true } },
    campuses: [
        { id: "primary", name: "Primary" },
        { id: "secondary", name: "Secondary" },
    ],
});
await provisionCompany(companyId, {
    companyId,
    name: "Admissions Test School",
    ownerUid: staffUid,
    agentName: "School Sarah (AI)",
});
await bootstrapEducareCompanyProfile(companyId);

const draft = await createAdmissionDraft(companyId, parentUid, {
    applicationType: "new",
    academicYear: "2027",
    gradeApplyingFor: "4",
    campusId: "primary",
    learner: { legalFirstName: "Lerato", legalSurname: "Mokoena", dateOfBirth: "2016-05-12", currentGrade: "3" },
    guardian: { fullName: "Parent Mokoena", mobile: "+27821234567", email: "parent@example.com" },
});
assert.ok(draft.reference?.startsWith("ADM-"));
assert.equal(draft.status, ADMISSION_STATUS.DRAFT);

await updateAdmissionDraft(companyId, parentUid, draft.applicationId, {
    learner: { preferredName: "Lera" },
});

let failSubmit;
try {
    await submitAdmissionApplication(companyId, parentUid, draft.applicationId, { consent: false });
    failSubmit = false;
} catch (e) {
    failSubmit = e.code === "CONSENT_REQUIRED";
}
assert.ok(failSubmit);

const submitted = await submitAdmissionApplication(companyId, parentUid, draft.applicationId, { consent: true });
assert.ok(
    submitted.status === ADMISSION_STATUS.SUBMITTED || submitted.status === ADMISSION_STATUS.DOCUMENTS_PENDING
);
assert.ok(submitted.reference);

const other = await createAdmissionDraft(companyId, parentB, {
    academicYear: "2027",
    gradeApplyingFor: "4",
    campusId: "primary",
    learner: { legalFirstName: "Lerato", legalSurname: "Mokoena", dateOfBirth: "2016-05-12" },
    guardian: { fullName: "Other Parent", mobile: "+27820000000" },
});
const dupSubmit = await submitAdmissionApplication(companyId, parentB, other.applicationId, { consent: true });
assert.equal(dupSubmit.duplicateReviewFlag, true);

try {
    await getAdmissionForParent(companyId, parentB, draft.applicationId);
    assert.fail("cross-parent read should fail");
} catch (e) {
    assert.equal(e.code, "NOT_FOUND");
}

const queue = await listAdmissionsForSchool(companyId, { status: submitted.status });
assert.ok(queue.applications.length >= 1);

const appId = submitted.applicationId;
await staffTransitionAdmission(companyId, appId, staffUid, { status: ADMISSION_STATUS.UNDER_REVIEW, note: "Assigned" });
const decided = await staffRecordAdmissionDecision(companyId, appId, staffUid, {
    outcome: ADMISSION_STATUS.PROVISIONAL_OFFER,
    notes: "Pilot offer",
});
assert.equal(decided.status, ADMISSION_STATUS.PROVISIONAL_OFFER);

console.log("edu-07-admissions: PASS");