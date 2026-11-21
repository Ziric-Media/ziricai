/**
 * REC-02 — offering catalogue + verification.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { clearBusinessDirectoryForTests, setBusinessDirectoryStoreForTests } from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { clearNetworkAdminAuditForTests, listNetworkAdminAudit } from "../services/network/networkAdminAudit.js";
import { clearRecommendationStoreForTests } from "../services/recommendations/recommendationStore.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import {
    submitVerification,
    decideVerification,
    clearVerificationCasesForTests,
} from "../services/network/verificationService.js";
import { createOffering, getOffering, listOfferingsForCompany } from "../services/recommendations/offeringService.js";
import {
    submitOfferingVerification,
    decideOfferingVerification,
    listOfferingVerificationQueue,
} from "../services/recommendations/offeringVerificationService.js";
import { mountRecommendationRoutes } from "../services/api/recommendationRoutes.js";

const PROD = { id: "acme-rec-02", name: "Acme Rec", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearRecommendationStoreForTests();
    clearNetworkAdminAuditForTests();
}

async function verifiedOrg() {
    await saveListingDraft(
        PROD.id,
        {
            displayName: "Acme Rec",
            industry: "Education",
            shortDescription: "Pilot school services.",
            location: "Rustenburg, South Africa",
            legalName: "Acme Rec (Pty) Ltd",
            registrationNumber: "2021/999999/07",
        },
        "owner-1",
        deps
    );
    await publishListing(PROD.id, "owner-1", deps);
    const orgCase = await submitVerification(PROD.id, "owner-1");
    await decideVerification(
        orgCase.caseId,
        { action: "verify", note: "CIPC ok", checks: ["registration_number_matches_registry", "legal_name_matches_registry"] },
        "mc-1"
    );
}

test("offering CRUD requires verified org for submit; officer verify activates offering", async () => {
    reset();
    const offering = await createOffering(PROD.id, {
        displayName: "Primary admissions package",
        description: "Grade R–7 enrolment guidance.",
        categoryIds: ["education"],
    });
    assert.equal(offering.status, "draft");
    assert.equal(offering.verificationStatus, "unverified");

    await assert.rejects(() => submitOfferingVerification(PROD.id, offering.offeringId, "owner-1"), { code: "ORG_NOT_VERIFIED" });

    await verifiedOrg();
    const kase = await submitOfferingVerification(PROD.id, offering.offeringId, "owner-1");
    assert.equal(kase.status, "submitted");
    const mid = await getOffering(PROD.id, offering.offeringId);
    assert.equal(mid.verificationStatus, "submitted");

    await assert.rejects(
        () => decideOfferingVerification(kase.caseId, { action: "verify", note: "ok" }, "mc-2"),
        { code: "CHECKS_REQUIRED" }
    );

    const done = await decideOfferingVerification(
        kase.caseId,
        {
            action: "verify",
            note: "Programme details confirmed",
            checks: ["supplier_authority_confirmed", "offering_description_accurate", "category_eligible"],
        },
        "mc-2"
    );
    assert.equal(done.status, "verified");
    const active = await getOffering(PROD.id, offering.offeringId);
    assert.equal(active.status, "active");
    assert.equal(active.verificationStatus, "verified");

    const queue = await listOfferingVerificationQueue({ status: "verified" });
    assert.ok(queue.some((c) => c.caseId === kase.caseId));

    const audit = await listNetworkAdminAudit({ companyId: PROD.id });
    assert.ok(audit.some((a) => a.action === "recommendation.offering_verification.verify"));
});

test("API: tenant list/create + platform queue", async () => {
    reset();
    await verifiedOrg();
    const app = express();
    app.use(express.json());
    let platformOk = true;
    mountRecommendationRoutes(app, {
        authorize: async (req, companyId, { write }) => {
            if (write) req.tenant = { companyId, uid: "owner-1", role: "owner" };
            else req.tenant = { companyId, uid: "owner-1", role: "owner" };
            return req.tenant;
        },
        platformGuard: (req, res, next) => {
            if (!platformOk) return res.status(403).json({ code: "PLATFORM_FORBIDDEN" });
            req.platformAuth = { via: "superadmin", uid: "mc-1" };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const createRes = await fetch(`${base}/api/companies/${PROD.id}/recommendations/offerings`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                displayName: "After-school care",
                description: "Supervised care until 17:00.",
                categoryIds: ["education"],
            }),
        });
        const created = await createRes.json();
        assert.equal(createRes.status, 201);
        const offeringId = created.data.offering.offeringId;

        const listRes = await fetch(`${base}/api/companies/${PROD.id}/recommendations/offerings`);
        const listed = await listRes.json();
        assert.equal(listed.data.offerings.length, 1);

        const subRes = await fetch(
            `${base}/api/companies/${PROD.id}/recommendations/offerings/${offeringId}/submit-verification`,
            { method: "POST" }
        );
        assert.equal(subRes.status, 201);

        const qRes = await fetch(`${base}/api/operations/recommendations/verification-queue?status=submitted`);
        const queue = await qRes.json();
        assert.ok(queue.data.cases.length >= 1);
    } finally {
        server.close();
    }
});

test("list offerings for company", async () => {
    reset();
    await createOffering(PROD.id, {
        displayName: "A",
        description: "x",
        categoryIds: ["education"],
    });
    const rows = await listOfferingsForCompany(PROD.id);
    assert.equal(rows.length, 1);
});

console.log("rec-02-offering-verification.test.mjs scheduled");