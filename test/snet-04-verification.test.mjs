/**
 * SNET-04 — verification cases: tenant submit, officer decisions with recorded checks, durable admin audit,
 * badge explains itself, tenants cannot self-verify, pilot attestation is labelled honestly.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import {
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests, getOrgEntityByCompanyId } from "../services/network/networkIdentityService.js";
import { publishListing, saveListingDraft } from "../services/network/networkProfileService.js";
import {
    clearVerificationCasesForTests,
    decideVerification,
    getVerificationStatus,
    listVerificationCases,
    submitVerification,
} from "../services/network/verificationService.js";
import { clearNetworkAdminAuditForTests, listNetworkAdminAudit } from "../services/network/networkAdminAudit.js";
import { mountNetworkVerificationRoutes } from "../services/api/networkVerificationRoutes.js";

const PROD = { id: "acme-motors-1a2b", name: "Acme Motors", settings: { tenantClass: "production_customer" } };
const deps = { getCompany: async (id) => (id === PROD.id ? PROD : null) };
const FULL = {
    displayName: "Acme Motors",
    industry: "Automotive dealership",
    shortDescription: "New and pre-owned vehicles with an in-house service centre.",
    location: "Pretoria, South Africa",
};

function reset() {
    clearNetworkEntitiesForTests();
    setBusinessDirectoryStoreForTests(null);
    clearBusinessDirectoryForTests();
    clearVerificationCasesForTests();
    clearNetworkAdminAuditForTests();
}

async function listed(restricted = true) {
    await saveListingDraft(PROD.id, restricted ? { ...FULL, legalName: "Acme Motors (Pty) Ltd", registrationNumber: "2020/123456/07" } : FULL, "o", deps);
    return publishListing(PROD.id, "o", deps);
}

test("submit requires evidence; one open case at a time; status visible to tenant", async () => {
    reset();
    await listed(false);
    await assert.rejects(() => submitVerification(PROD.id, "o"), { code: "EVIDENCE_REQUIRED" });
    await saveListingDraft(PROD.id, { legalName: "Acme Motors (Pty) Ltd", registrationNumber: "2020/123456/07" }, "o", deps);

    const kase = await submitVerification(PROD.id, "owner-1");
    assert.equal(kase.status, "submitted");
    assert.equal(kase.evidence.registrationNumber, "2020/123456/07");
    await assert.rejects(() => submitVerification(PROD.id, "owner-1"), { code: "VERIFICATION_IN_PROGRESS" });

    const status = await getVerificationStatus(PROD.id);
    assert.equal(status.state, "submitted");
    assert.equal(status.latestCase.caseId, kase.caseId);
    assert.ok(!JSON.stringify(status).includes("2020/123456"), "tenant status never echoes evidence");
    assert.equal((await getOrgEntityByCompanyId(PROD.id)).verification.state, "submitted");
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies[0].verified, false);
});

test("officer: review → verify requires checks + note; badge lists what was checked; audit is durable", async () => {
    reset();
    await listed();
    const kase = await submitVerification(PROD.id, "owner-1");

    await assert.rejects(() => decideVerification(kase.caseId, { action: "verify", note: "ok" }, "mc-1"), { code: "CHECKS_REQUIRED" });
    await assert.rejects(() => decideVerification(kase.caseId, { action: "verify", checks: ["registration_number_matches_registry"] }, "mc-1"), { code: "NOTE_REQUIRED" });
    await assert.rejects(() => decideVerification(kase.caseId, { action: "verify", checks: ["made_up"], note: "x" }, "mc-1"), { code: "CHECKS_INVALID" });
    await assert.rejects(() => decideVerification(kase.caseId, { action: "explode" }, "mc-1"), { code: "VERIFICATION_ACTION_INVALID" });

    await decideVerification(kase.caseId, { action: "start_review" }, "mc-1");
    assert.equal((await getVerificationStatus(PROD.id)).state, "under_review");

    const done = await decideVerification(
        kase.caseId,
        { action: "verify", note: "CIPC extract matches", checks: ["registration_number_matches_registry", "legal_name_matches_registry"] },
        "mc-1"
    );
    assert.equal(done.status, "verified");
    assert.equal(done.history.length, 3);

    const card = (await searchDiscoverCompanies({ q: "acme" })).companies[0];
    assert.equal(card.verified, true);
    assert.equal(card.verification.state, "verified");
    assert.deepEqual(card.verification.checks, ["registration_number_matches_registry", "legal_name_matches_registry"]);
    assert.equal(card.verification.source, "verification_case");
    assert.ok(!JSON.stringify(card).includes("2020/123456"));

    const audit = await listNetworkAdminAudit({ snId: kase.snId });
    assert.deepEqual(audit.map((a) => a.action).sort(), ["verification.start_review", "verification.verify"]);
    assert.ok(audit.every((a) => a.actor === "mc-1"));

    await assert.rejects(() => decideVerification(kase.caseId, { action: "reject", note: "late" }, "mc-1"), { code: "VERIFICATION_STATE_INVALID" });
    await assert.rejects(() => submitVerification(PROD.id, "owner-1"), { code: "ALREADY_VERIFIED" });
});

test("reject / restrict remove the badge; rejected tenants may resubmit", async () => {
    reset();
    await listed();
    const first = await submitVerification(PROD.id, "o");
    await decideVerification(first.caseId, { action: "reject", note: "Registration number not found" }, "mc-2");
    let status = await getVerificationStatus(PROD.id);
    assert.equal(status.state, "rejected");
    assert.equal(status.latestCase.decisionNote, "Registration number not found");
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies[0].verified, false);

    const second = await submitVerification(PROD.id, "o");
    assert.notEqual(second.caseId, first.caseId);
    await decideVerification(second.caseId, { action: "verify", note: "ok", checks: ["ownership_confirmed"] }, "mc-2");
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies[0].verified, true);

    await decideVerification(second.caseId, { action: "restrict", note: "Complaint under review" }, "mc-2");
    status = await getVerificationStatus(PROD.id);
    assert.equal(status.state, "restricted");
    assert.deepEqual(status.checked, []);
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies[0].verified, false);
    assert.equal((await listVerificationCases({ status: "restricted" })).length, 1);
});

test("tenants cannot self-verify through the listing; pilot badge is an honest operator attestation", async () => {
    reset();
    await assert.rejects(() => saveListingDraft(PROD.id, { verified: true }, "o", deps), { code: "PROFILE_FIELD_NOT_ALLOWED" });
    const smile = (await searchDiscoverCompanies()).companies.find((c) => c.companyId === SMILEMORE_DEMO_COMPANY_ID);
    assert.equal(smile.verified, true);
    assert.equal(smile.verification.source, "operator_pilot_attestation");
    assert.deepEqual(smile.verification.checks, ["operator_attestation"]);
});

test("API: tenant submit/status + platform queue/decision with guards", async () => {
    reset();
    await listed();
    let platformOk = false;
    let role = "manager";
    const app = express();
    app.use(express.json());
    mountNetworkVerificationRoutes(app, {
        authorize: async (req, companyId, { write }) => {
            if (write && role === "viewer") throw Object.assign(new Error("denied"), { status: 403, code: "PERMISSION_DENIED" });
            req.tenant = { companyId, uid: "uid-9", role };
            return req.tenant;
        },
        platformGuard: (req, res, next) => {
            if (!platformOk) return res.status(403).json({ code: "PLATFORM_FORBIDDEN" });
            req.platformAuth = { via: "superadmin", uid: "sa-1" };
            next();
        },
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, method = "GET", body) => {
        const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };
    const V = `/api/network/v1/orgs/${PROD.id}/verification`;
    try {
        role = "viewer";
        assert.equal((await call(V, "POST", {})).status, 403);
        role = "manager";
        let r = await call(V, "POST", {});
        assert.equal(r.status, 201);
        const { caseId } = r.body.data;
        assert.equal((await call(V)).body.data.state, "submitted");

        assert.equal((await call("/api/platform/network/v1/verification")).status, 403);
        platformOk = true;
        r = await call("/api/platform/network/v1/verification?status=submitted");
        assert.equal(r.body.data.cases.length, 1);
        r = await call(`/api/platform/network/v1/verification/${caseId}/decision`, "POST", {
            action: "verify",
            note: "Checked registry",
            checks: ["registration_number_matches_registry"],
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.data.case.status, "verified");
        assert.equal(r.body.data.case.decidedBy, "sa-1");
        r = await call(`/api/platform/network/v1/verification/${caseId}/decision`, "POST", { action: "verify", note: "x", checks: ["ownership_confirmed"] });
        assert.equal(r.status, 409);
        assert.equal((await call("/api/platform/network/v1/verification/vc_nope")).status, 404);
    } finally {
        server.close();
    }
});

test("API: default guards reject unauthenticated callers", async () => {
    const app = express();
    app.use(express.json());
    mountNetworkVerificationRoutes(app);
    const server = app.listen(0);
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const [method, path] of [
            ["GET", "/api/network/v1/orgs/acme/verification"],
            ["POST", "/api/network/v1/orgs/acme/verification"],
            ["GET", "/api/platform/network/v1/verification"],
            ["POST", "/api/platform/network/v1/verification/vc_1/decision"],
        ]) {
            const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
            assert.ok([401, 403].includes(res.status), `${method} ${path} → ${res.status}`);
        }
    } finally {
        server.close();
    }
});
