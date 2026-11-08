/**
 * SNET-04 — Verification cases (MVP).
 *
 * States (spec §12): unverified → submitted → under_review → verified | rejected | restricted.
 * A "verified" badge must say what was checked — an officer cannot verify without recording `checks`.
 * Evidence is the tenant's restricted block (legal name / registration number); it is copied into the case
 * (verification-restricted) and is never part of any public payload. Document storage is out of scope for MVP.
 *
 * System of record: `networkVerificationCases/{caseId}`. Denormalised on the entity (`verification`) and on the
 * directory entry (`verified`, `verificationSummary`) so Discover cards render without joins.
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { recordNetworkAdminAction } from "./networkAdminAudit.js";
import {
    ensureOrgEntity,
    getOrgEntityByCompanyId,
    setOrgEntityVerification,
} from "./networkIdentityService.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    invalidateDirectoryEntity,
    saveBusinessDirectoryEntry,
} from "../users/businessDirectoryService.js";

export const VERIFICATION_STATES = Object.freeze({
    UNVERIFIED: "unverified",
    SUBMITTED: "submitted",
    UNDER_REVIEW: "under_review",
    VERIFIED: "verified",
    REJECTED: "rejected",
    RESTRICTED: "restricted",
});

export const VERIFICATION_CHECKS = Object.freeze([
    "registration_number_matches_registry",
    "legal_name_matches_registry",
    "ownership_confirmed",
    "address_confirmed",
    "operator_attestation",
]);

/** action → { from: allowed current states, to: next state, needs: required inputs } */
const TRANSITIONS = {
    start_review: { from: ["submitted"], to: "under_review", needsNote: false, needsChecks: false },
    verify: { from: ["submitted", "under_review"], to: "verified", needsNote: true, needsChecks: true },
    reject: { from: ["submitted", "under_review"], to: "rejected", needsNote: true, needsChecks: false },
    restrict: { from: ["under_review", "verified"], to: "restricted", needsNote: true, needsChecks: false },
};

const OPEN = new Set(["submitted", "under_review"]);
const col = createNetworkCollection(NETWORK_COLLECTIONS.VERIFICATION_CASES);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

/** @param {string} companyId */
export async function listCasesForCompany(companyId) {
    const rows = (await col.list({ where: [["companyId", "==", companyId]], limit: 100 })).map(strip);
    return rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

/** Tenant view of its verification status (no evidence echo beyond what the tenant itself submitted). */
export async function getVerificationStatus(companyId) {
    const entity = await getOrgEntityByCompanyId(companyId);
    const cases = await listCasesForCompany(companyId);
    const latest = cases[0] || null;
    return {
        snId: entity?.snId || null,
        state: entity?.verification?.state || VERIFICATION_STATES.UNVERIFIED,
        checked: entity?.verification?.checked || [],
        latestCase: latest
            ? {
                  caseId: latest.caseId,
                  status: latest.status,
                  submittedAt: latest.submittedAt,
                  decidedAt: latest.decidedAt || null,
                  decisionNote: latest.status === "rejected" || latest.status === "restricted" ? latest.decisionNote || null : null,
              }
            : null,
    };
}

async function applyOutcome(companyId, kase) {
    const verified = kase.status === VERIFICATION_STATES.VERIFIED;
    const verification = {
        state: kase.status,
        caseId: kase.caseId,
        level: kase.level,
        checked: verified ? kase.checks || [] : [],
        verifiedAt: verified ? kase.decidedAt : null,
    };
    await setOrgEntityVerification(companyId, verification);
    await hydrateBusinessDirectory();
    if (getBusinessDirectoryEntry(companyId)) {
        await saveBusinessDirectoryEntry(companyId, {
            verified,
            verificationSummary: {
                state: kase.status,
                level: kase.level,
                checks: verified ? kase.checks || [] : [],
                source: "verification_case",
                caseId: kase.caseId,
                verifiedAt: verified ? kase.decidedAt : null,
            },
        });
    }
    invalidateDirectoryEntity(companyId);
}

/**
 * Tenant submits for verification. Requires the restricted evidence (legalName + registrationNumber) to be on file.
 * @param {string} companyId
 * @param {string|null} actorUid
 */
export async function submitVerification(companyId, actorUid = null) {
    await hydrateBusinessDirectory();
    const entry = getBusinessDirectoryEntry(companyId);
    const evidence = entry?.restricted || {};
    const missing = ["legalName", "registrationNumber"].filter((k) => !String(evidence[k] || "").trim());
    if (missing.length) {
        throw Object.assign(err(422, "EVIDENCE_REQUIRED", `Add ${missing.join(" and ")} to your listing before requesting verification.`), { missing });
    }
    const entity = await ensureOrgEntity(companyId);
    const state = entity.verification?.state || VERIFICATION_STATES.UNVERIFIED;
    if (state === VERIFICATION_STATES.VERIFIED) throw err(409, "ALREADY_VERIFIED", "This business is already verified.");
    if (OPEN.has(state)) throw err(409, "VERIFICATION_IN_PROGRESS", "A verification request is already in progress.");

    const now = new Date().toISOString();
    const kase = {
        caseId: `vc_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        snId: entity.snId,
        companyId,
        level: "business_registration",
        status: VERIFICATION_STATES.SUBMITTED,
        source: "tenant_submission",
        submittedBy: actorUid,
        submittedAt: now,
        evidence: { legalName: evidence.legalName, registrationNumber: evidence.registrationNumber },
        checks: [],
        history: [{ at: now, actor: actorUid || "tenant", from: state, to: VERIFICATION_STATES.SUBMITTED, note: null }],
    };
    await col.put(kase.caseId, kase, { merge: false });
    await applyOutcome(companyId, kase);
    return kase;
}

/**
 * Officer decision (platform). Audited durably; never succeeds without an audit record.
 * @param {string} caseId
 * @param {{ action: keyof typeof TRANSITIONS, note?: string, checks?: string[] }} decision
 * @param {string} actor platform uid / "api_key"
 */
export async function decideVerification(caseId, decision, actor) {
    const t = TRANSITIONS[decision?.action];
    if (!t) throw err(400, "VERIFICATION_ACTION_INVALID", `Unknown action. Use: ${Object.keys(TRANSITIONS).join(", ")}`);
    const raw = await col.get(caseId);
    if (!raw) throw err(404, "CASE_NOT_FOUND", "Verification case not found.");
    const kase = strip(raw);
    if (!t.from.includes(kase.status)) {
        throw err(409, "VERIFICATION_STATE_INVALID", `Cannot ${decision.action} a case that is ${kase.status}.`);
    }
    const note = String(decision.note || "").trim();
    if (t.needsNote && !note) throw err(422, "NOTE_REQUIRED", "A decision note is required.");
    const checks = [...new Set((decision.checks || []).map(String))];
    if (t.needsChecks) {
        if (!checks.length) throw err(422, "CHECKS_REQUIRED", "Record what was checked before verifying.");
        const unknown = checks.filter((c) => !VERIFICATION_CHECKS.includes(c));
        if (unknown.length) throw err(422, "CHECKS_INVALID", `Unknown checks: ${unknown.join(", ")}`);
    }
    const now = new Date().toISOString();
    const next = {
        ...kase,
        status: t.to,
        checks: t.needsChecks ? checks : kase.checks || [],
        decisionNote: note || kase.decisionNote || null,
        decidedBy: actor,
        decidedAt: t.to === "under_review" ? kase.decidedAt || null : now,
        history: [...(kase.history || []), { at: now, actor, from: kase.status, to: t.to, note: note || null }],
    };
    await col.put(caseId, next, { merge: false });
    await applyOutcome(kase.companyId, next);
    await recordNetworkAdminAction({
        actor,
        action: `verification.${decision.action}`,
        snId: kase.snId,
        companyId: kase.companyId,
        detail: { caseId, from: kase.status, to: t.to, checks: next.checks, note: note || null },
    });
    return next;
}

/** @param {{ status?: string, limit?: number }} [opts] platform queue, oldest submitted first */
export async function listVerificationCases({ status, limit = 100 } = {}) {
    const where = status ? [["status", "==", status]] : [];
    const rows = (await col.list({ where, limit: 500 })).map(strip);
    return rows.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt))).slice(0, limit);
}

export async function getVerificationCase(caseId) {
    const raw = await col.get(caseId);
    return raw ? strip(raw) : null;
}

export function clearVerificationCasesForTests() {
    col.clearMemory();
}
