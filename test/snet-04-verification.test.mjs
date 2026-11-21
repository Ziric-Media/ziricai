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
    addVerificationEvidence,
    decideVerification,
    getVerificationCase,
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
            ["POST", "/api/network/v1/orgs/acme/verification/evidence"],
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

/* ---------- SNET-04 MVP+: evidence references, request-info, approve alias ---------- */

test("evidence refs: https URL / external ref only; attached to the open case; platform sees them, public never", async () => {
    reset();
    await listed();
    await assert.rejects(() => addVerificationEvidence(PROD.id, [{ kind: "other", label: "x", url: "https://a.example/x" }], "o"), { code: "NO_OPEN_CASE" });

    const kase = await submitVerification(PROD.id, "owner-1", {
        evidence: [{ kind: "registration_certificate", label: "CIPC certificate", url: "https://files.example.com/cipc.pdf" }],
    });
    assert.equal(kase.evidenceCount, 1);

    for (const bad of [
        { kind: "other", label: "http link", url: "http://insecure.example/x" },
        { kind: "other", label: "js", url: "javascript:alert(1)" },
        { kind: "other", label: "creds", url: "https://user:pw@example.com/x" },
        { kind: "bogus", label: "kind", url: "https://ok.example/x" },
        { kind: "other", label: "", url: "https://ok.example/x" },
        { kind: "other", label: "nothing" },
    ]) {
        await assert.rejects(() => addVerificationEvidence(PROD.id, [bad], "o"), { code: "EVIDENCE_INVALID" }, JSON.stringify(bad));
    }

    const added = await addVerificationEvidence(PROD.id, [{ kind: "proof_of_address", label: "Utility bill", ref: "DRIVE:utility-2026-10" }], "owner-1");
    assert.equal(added.evidence.length, 1);
    assert.equal(added.status, "submitted");

    const status = await getVerificationStatus(PROD.id);
    assert.equal(status.latestCase.evidence.length, 2);
    assert.ok(!JSON.stringify(status).includes("2020/123456"), "restricted registration number is never echoed to the tenant");

    const detail = await getVerificationCase(kase.caseId);
    assert.equal(detail.evidenceRefs.length, 2);
    assert.equal(detail.evidenceCount, 2);
    assert.ok(!JSON.stringify(await searchDiscoverCompanies({ q: "acme" })).includes("files.example.com"), "evidence is never public");
    assert.ok((await listVerificationCases()).every((c) => c.evidenceRefs === undefined), "queue rows stay light");
});

test("evidence: capped at 10 per case", async () => {
    reset();
    await listed();
    await submitVerification(PROD.id, "o");
    const ten = Array.from({ length: 10 }, (_, i) => ({ kind: "other", label: `Doc ${i}`, url: `https://x.example/${i}` }));
    await addVerificationEvidence(PROD.id, ten, "o");
    await assert.rejects(() => addVerificationEvidence(PROD.id, [ten[0]], "o"), { code: "EVIDENCE_LIMIT" });
});

test("request_info asks the tenant for more; adding evidence returns the case to review; approve = verify", async () => {
    reset();
    await listed();
    const kase = await submitVerification(PROD.id, "o");
    await assert.rejects(() => decideVerification(kase.caseId, { action: "request_info" }, "mc-1"), { code: "NOTE_REQUIRED" });

    const asked = await decideVerification(kase.caseId, { action: "request_info", note: "Please attach the CIPC certificate" }, "mc-1");
    assert.equal(asked.status, "info_requested");
    assert.equal(asked.decidedAt, null, "asking for info is not a final decision");
    let status = await getVerificationStatus(PROD.id);
    assert.equal(status.state, "info_requested");
    assert.equal(status.latestCase.decisionNote, "Please attach the CIPC certificate");
    await assert.rejects(() => submitVerification(PROD.id, "o"), { code: "VERIFICATION_IN_PROGRESS" });
    assert.equal((await searchDiscoverCompanies({ q: "acme" })).companies[0].verified, false);

    const back = await addVerificationEvidence(PROD.id, [{ kind: "registration_certificate", label: "CIPC", url: "https://files.example.com/c.pdf" }], "o");
    assert.equal(back.status, "under_review");
    assert.equal((await getVerificationStatus(PROD.id)).state, "under_review");

    const done = await decideVerification(kase.caseId, { action: "approve", note: "CIPC matches", checks: ["registration_number_matches_registry"] }, "mc-1");
    assert.equal(done.status, "verified");
    const audit = await listNetworkAdminAudit({ snId: kase.snId });
    assert.ok(audit.some((a) => a.action === "verification.verify"), "alias is audited as the canonical action");
    assert.ok(audit.some((a) => a.action === "verification.request_info"));
});

test("API: evidence submit + MC detail with evidence; request_info/approve over HTTP", async () => {
    reset();
    await listed();
    const app = express();
    app.use(express.json());
    mountNetworkVerificationRoutes(app, {
        authorize: async (req, companyId) => {
            req.tenant = { companyId, uid: "uid-9", role: "owner" };
            return req.tenant;
        },
        platformGuard: (req, _res, next) => {
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
        assert.equal((await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "a", url: "https://a.example/a" }] })).status, 409);
        let r = await call(V, "POST", { evidence: [{ kind: "website", label: "Company site", url: "https://acme.example.com" }] });
        assert.equal(r.status, 201);
        assert.equal(r.body.data.evidenceCount, 1);
        const { caseId } = r.body.data;

        r = await call(`${V}/evidence`, "POST", { items: [{ kind: "other", label: "bad", url: "http://nope.example" }] });
        assert.equal(r.status, 422);
        assert.equal(r.body.error.code, "EVIDENCE_INVALID");
        assert.ok(r.body.error.fields.url);

        r = await call(`${V}/evidence`, "POST", { kind: "ownership_proof", label: "Share certificate", ref: "DOC-77" });
        assert.equal(r.status, 201);

        r = await call(V);
        assert.equal(r.body.data.latestCase.evidence.length, 2);
        assert.ok(r.body.data.evidenceKinds.includes("registration_certificate"));

        r = await call(`/api/platform/network/v1/verification/${caseId}`);
        assert.equal(r.body.data.case.evidenceRefs.length, 2);

        r = await call(`/api/platform/network/v1/verification/${caseId}/decision`, "POST", { action: "request_info", note: "Need CIPC" });
        assert.equal(r.body.data.case.status, "info_requested");
        r = await call(`/api/platform/network/v1/verification?status=info_requested`);
        assert.equal(r.body.data.cases.length, 1);
        r = await call(`/api/platform/network/v1/verification/${caseId}/decision`, "POST", { action: "approve", note: "ok", checks: ["ownership_confirmed"] });
        assert.equal(r.body.data.case.status, "verified");
    } finally {
        server.close();
    }
});

test("Mission Control: verification decisions use a form modal (no window.prompt), show evidence refs, offer request-info", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    const mod = read("js/admin/modules/sarah-network.js");
    assert.ok(!/window\.prompt/.test(mod), "no window.prompt left in the Sarah Network page");
    assert.match(mod, /function openDecisionModal\(/);
    assert.match(mod, /fetchNetworkVerificationCase\(btn\.dataset\.caseId\)/);
    assert.match(mod, /\['request_info', 'Request info'\]/);
    assert.match(mod, /'info_requested'/);
    assert.match(read("js/admin/api.js"), /export async function fetchNetworkVerificationCase/);
    // evidence links are only rendered for https URLs
    assert.match(mod, /\^https:\\\/\\\//);
});
