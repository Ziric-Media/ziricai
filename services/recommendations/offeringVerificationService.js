/**
 * REC-02 — offering verification cases (extends SNET-04 officer workflow patterns).
 */
import { randomUUID } from "node:crypto";
import { VERIFICATION_STATES } from "../network/verificationService.js";
import { getOrgEntityByCompanyId } from "../network/networkIdentityService.js";
import { recordNetworkAdminAction } from "../network/networkAdminAudit.js";
import { offeringVerificationCol } from "./recommendationStore.js";
import {
    OFFERING_VERIFICATION_STATUS,
    OFFERING_VERIFICATION_CHECKS,
    isOpenOfferingVerification,
} from "./offeringConstants.js";
import { applyOfferingVerificationOutcome, getOffering } from "./offeringService.js";

const TRANSITIONS = {
    start_review: { from: ["submitted"], to: OFFERING_VERIFICATION_STATUS.UNDER_REVIEW, needsNote: false, needsChecks: false },
    verify: {
        from: ["submitted", "under_review"],
        to: OFFERING_VERIFICATION_STATUS.VERIFIED,
        needsNote: true,
        needsChecks: true,
    },
    reject: { from: ["submitted", "under_review"], to: OFFERING_VERIFICATION_STATUS.REJECTED, needsNote: true, needsChecks: false },
    suspend: { from: ["verified"], to: OFFERING_VERIFICATION_STATUS.SUSPENDED, needsNote: true, needsChecks: false },
};

const ACTION_ALIASES = { approve: "verify" };

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

async function assertOrgVerified(companyId) {
    const entity = await getOrgEntityByCompanyId(companyId);
    const state = entity?.verification?.state;
    if (state !== VERIFICATION_STATES.VERIFIED) {
        throw err(
            422,
            "ORG_NOT_VERIFIED",
            "Organisation must be verified on Sarah Network before offering verification."
        );
    }
    return entity;
}

/** List open + decided cases for an offering (newest first). */
export async function listCasesForOffering(offeringId) {
    const rows = (await offeringVerificationCol.list({ where: [["offeringId", "==", offeringId]], limit: 50 })).map(strip);
    return rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

/**
 * Tenant submits offering for verification.
 * @param {string} companyId
 * @param {string} offeringId
 * @param {string|null} actorUid
 */
export async function submitOfferingVerification(companyId, offeringId, actorUid = null) {
    await assertOrgVerified(companyId);
    const offering = await getOffering(companyId, offeringId);
    if (!offering) throw err(404, "OFFERING_NOT_FOUND", "Offering not found.");
    if (isOpenOfferingVerification(offering.verificationStatus)) {
        throw err(409, "VERIFICATION_IN_PROGRESS", "Offering verification is already in progress.");
    }
    if (offering.verificationStatus === OFFERING_VERIFICATION_STATUS.VERIFIED) {
        throw err(409, "ALREADY_VERIFIED", "Offering is already verified.");
    }
    if (!String(offering.description || "").trim()) {
        throw err(422, "OFFERING_INCOMPLETE", "Add a description before submitting for verification.");
    }

    const entity = await getOrgEntityByCompanyId(companyId);
    const now = new Date().toISOString();
    const caseId = `ovc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const kase = {
        caseId,
        offeringId,
        companyId,
        snId: entity?.snId || null,
        displayName: offering.displayName,
        categoryIds: offering.categoryIds,
        status: OFFERING_VERIFICATION_STATUS.SUBMITTED,
        submittedBy: actorUid,
        submittedAt: now,
        checks: [],
        decisionNote: null,
        history: [{ at: now, actor: actorUid || "tenant", from: offering.verificationStatus, to: OFFERING_VERIFICATION_STATUS.SUBMITTED, note: null }],
    };
    await offeringVerificationCol.put(caseId, kase, { merge: false });
    await applyOfferingVerificationOutcome(offeringId, kase);
    return kase;
}

/** @param {{ status?: string, limit?: number }} [opts] */
export async function listOfferingVerificationQueue({ status, limit = 100 } = {}) {
    const where = status ? [["status", "==", status]] : [];
    const rows = (await offeringVerificationCol.list({ where, limit: 500 })).map(strip);
    return rows.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt))).slice(0, limit);
}

export async function getOfferingVerificationCase(caseId) {
    const raw = await offeringVerificationCol.get(caseId);
    return raw ? strip(raw) : null;
}

/**
 * @param {string} caseId
 * @param {{ action: string, note?: string, checks?: string[] }} decision
 * @param {string} actor
 */
export async function decideOfferingVerification(caseId, rawDecision, actor) {
    const action = ACTION_ALIASES[rawDecision?.action] || rawDecision?.action;
    const t = TRANSITIONS[action];
    if (!t) {
        throw err(400, "VERIFICATION_ACTION_INVALID", `Unknown action. Use: ${Object.keys(TRANSITIONS).join(", ")}`);
    }
    const raw = await offeringVerificationCol.get(caseId);
    if (!raw) throw err(404, "CASE_NOT_FOUND", "Offering verification case not found.");
    const kase = strip(raw);
    if (!t.from.includes(kase.status)) {
        throw err(409, "VERIFICATION_STATE_INVALID", `Cannot ${action} a case that is ${kase.status}.`);
    }
    const note = String(rawDecision?.note || "").trim();
    if (t.needsNote && !note) throw err(422, "NOTE_REQUIRED", "A decision note is required.");
    const checks = [...new Set((rawDecision?.checks || []).map(String))];
    if (t.needsChecks) {
        if (!checks.length) throw err(422, "CHECKS_REQUIRED", "Record what was checked before verifying.");
        const unknown = checks.filter((c) => !OFFERING_VERIFICATION_CHECKS.includes(c));
        if (unknown.length) throw err(422, "CHECKS_INVALID", `Unknown checks: ${unknown.join(", ")}`);
    }
    const now = new Date().toISOString();
    const next = {
        ...kase,
        status: t.to,
        checks: t.needsChecks ? checks : kase.checks || [],
        decisionNote: note || kase.decisionNote || null,
        decidedBy: actor,
        decidedAt: now,
        history: [...(kase.history || []), { at: now, actor, from: kase.status, to: t.to, note: note || null }],
    };
    await offeringVerificationCol.put(caseId, next, { merge: false });
    await applyOfferingVerificationOutcome(kase.offeringId, next);
    await recordNetworkAdminAction({
        actor,
        action: `recommendation.offering_verification.${action}`,
        snId: kase.snId,
        companyId: kase.companyId,
        detail: { caseId, offeringId: kase.offeringId, from: kase.status, to: t.to, checks: next.checks, note: note || null },
    });
    return next;
}

export async function getOfferingVerificationStatus(companyId, offeringId) {
    const offering = await getOffering(companyId, offeringId);
    if (!offering) throw err(404, "OFFERING_NOT_FOUND", "Offering not found.");
    const cases = await listCasesForOffering(offeringId);
    const latest = cases[0] || null;
    return { offering, latestCase: latest };
}