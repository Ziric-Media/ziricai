#!/usr/bin/env node
/**
 * EDU-06 — school guardian journey (memory backend).
 */
import assert from "node:assert/strict";

process.env.STORAGE_BACKEND = "memory";

const companyId = `educare-pilot-${Date.now()}`;
const parentUid = `parent_${Date.now()}`;
const staffUid = `staff_${Date.now()}`;

const { createCompany } = await import("../services/tenants/companyService.js");
const { provisionCompany } = await import("../services/platform/provisioningService.js");
const { ensureOrgEntitySafe, getOrgEntityByCompanyId } = await import("../services/network/networkIdentityService.js");
const {
    submitGuardianApplication,
    decideGuardianLink,
    listGuardianLinksForSchool,
    GUARDIAN_STATUS,
} = await import("../services/education/schoolGuardianService.js");
const { recordSubscriberEvent } = await import("../services/network/subscriberEventService.js");
const { getConnectionStatus } = await import("../services/network/connectionService.js");
const { bootstrapEducareCompanyProfile } = await import("../services/education/educareTenantBootstrap.js");
const { saveListingDraft, publishListing } = await import("../services/network/networkProfileService.js");
const { getCompany } = await import("../services/tenants/companyService.js");
const { upsertBusinessDirectoryEntry } = await import("../services/users/businessDirectoryService.js");

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

await createCompany(companyId, {
    name: "Test School",
    industry: "Education",
    status: "active",
    ownerUid: staffUid,
    settings: {
        tenantClass: "PILOT",
        education: { requireVerifiedGuardians: true },
    },
});
await provisionCompany(companyId, {
    companyId,
    name: "Test School",
    ownerUid: staffUid,
    agentName: "School Sarah (AI)",
});
await bootstrapEducareCompanyProfile(companyId);
await ensureOrgEntitySafe(companyId);
const deps = { getCompany };
await saveListingDraft(
    companyId,
    {
        displayName: "Test School",
        industry: "Education",
        shortDescription: "Christian education pilot.",
        location: "Rustenburg, South Africa",
        contact: { phone: "+27140000000", email: "school@example.com" },
        hours: [{ day: "Mon–Fri", time: "07:00–16:00" }],
    },
    staffUid,
    deps
);
await publishListing(companyId, staffUid, deps);
upsertBusinessDirectoryEntry(companyId, {
    companyId,
    discoverability: "public",
    displayName: "Test School",
    industry: "Education",
    location: "Rustenburg, South Africa",
});

const app = await submitGuardianApplication(companyId, parentUid, {
    competentPersonConsent: true,
    relationship: "parent",
    prefs: { announcements: true, notifications: true, reminders: false },
    learners: [{ name: "Sam", grade: "5", campusId: "primary" }],
});

assert.equal(app.status, GUARDIAN_STATUS.PENDING);

const pending = await listGuardianLinksForSchool(companyId, { status: "pending" });
assert.equal(pending.length, 1);

const linkId = pending[0].linkId;
const beforeConn = await getConnectionStatus(parentUid, (await getOrgEntityByCompanyId(companyId)).snId);
assert.ok(!beforeConn || beforeConn.state !== "subscribed");

await decideGuardianLink(companyId, linkId, "approve", staffUid);

const afterConn = await getConnectionStatus(parentUid, (await getOrgEntityByCompanyId(companyId)).snId);
assert.equal(afterConn.state, "subscribed");

const evt = await recordSubscriberEvent(
    companyId,
    { type: "announcement", title: "Campus notice", body: "Welcome", campusId: "primary" },
    "staff"
);
assert.ok(evt.audience.wouldReceive >= 1 || evt.delivered >= 1);

console.log("edu-06-acceptance: PASS");
