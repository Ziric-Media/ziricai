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
    /** Officer asked the tenant for more evidence; adding evidence returns the case to under_review. */
    INFO_REQUESTED: "info_requested",
});

export const EVIDENCE_KINDS = Object.freeze([
    "registration_certificate",
    "proof_of_address",
    "ownership_proof",
    "website",
    "other",
]);
const MAX_EVIDENCE_PER_CASE = 10;

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
    request_info: { from: ["submitted", "under_review"], to: "info_requested", needsNote: true, needsChecks: false },
    verify: { from: ["submitted", "under_review", "info_requested"], to: "verified", needsNote: true, needsChecks: true },
    reject: { from: ["submitted", "under_review", "info_requested"], to: "rejected", needsNote: true, needsChecks: false },
    restrict: { from: ["under_review", "verified"], to: "restricted", needsNote: true, needsChecks: false },
};

/** Action aliases accepted on the decision API (approve = verify). */
const ACTION_ALIASES = { approve: "verify" };

const OPEN = new Set(["submitted", "under_review", "info_requested"]);
const col = createNetworkCollection(NETWORK_COLLECTIONS.VERIFICATION_CASES);
const evidenceCol = createNetworkCollection(NETWORK_COLLECTIONS.VERIFICATION_EVIDENCE);

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

function clientEvidence(row) {
    const { evidenceId, kind, label, url = null, ref = null, addedAt } = row;
    return { evidenceId, kind, label, url, ref, addedAt };
}

/** Evidence references attached to a case, oldest first. */
export async function listEvidenceForCase(caseId) {
    const rows = (await evidenceCol.list({ where: [["caseId", "==", caseId]], limit: 100 })).map(strip);
    return rows.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
}

/**
 * Validate one evidence reference. MVP: no file storage — an https URL and/or an external reference string.
 * @returns {{ kind: string, label: string, url: string|null, ref: string|null }}
 */
export function normalizeEvidenceRef(raw) {
    const fields = {};
    const kind = String(raw?.kind || "other").trim();
    if (!EVIDENCE_KINDS.includes(kind)) fields.kind = `Use one of: ${EVIDENCE_KINDS.join(", ")}`;
    const label = String(raw?.label || "").trim();
    if (!label || label.length > 120) fields.label = "Label is required (max 120 characters).";
    let url = String(raw?.url || "").trim();
    const ref = String(raw?.ref || "").trim();
    if (url) {
        try {
            const u = new URL(url);
            if (u.protocol !== "https:" || u.username || u.password || url.length > 500) throw new Error("bad");
            url = u.toString();
        } catch {
            fields.url = "Use a public https:// link (max 500 characters, no credentials).";
        }
    }
    if (ref.length > 200) fields.ref = "Reference is too long (max 200 characters).";
    if (!url && !ref) fields.url = fields.url || "Provide a https link or a reference.";
    if (Object.keys(fields).length) {
        throw Object.assign(err(422, "EVIDENCE_INVALID", "Evidence reference is invalid."), { fields });
    }
    return { kind, label, url: url || null, ref: ref || null };
}

async function writeEvidence(kase, refs, actorUid, now) {
    const saved = [];
    for (const r of refs) {
        const row = {
            evidenceId: `ev_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
            caseId: kase.caseId,
            companyId: kase.companyId,
            snId: kase.snId,
            ...r,
            addedBy: actorUid,
            addedAt: now,
        };
        await evidenceCol.put(row.evidenceId, row, { merge: false });
        saved.push(row);
    }
    return saved;
}

/**
 * Tenant attaches evidence references to its open case. When the officer asked for more information
 * (`info_requested`) the case returns to `under_review`.
 * @param {string} companyId
 * @param {object[]} items
 * @param {string|null} actorUid
 */
export async function addVerificationEvidence(companyId, items, actorUid = null) {
    const list = Array.isArray(items) ? items : items ? [items] : [];
    if (!list.length) throw err(422, "EVIDENCE_INVALID", "Provide at least one evidence reference.");
    const refs = list.map(normalizeEvidenceRef);
    const cases = await listCasesForCompany(companyId);
    const raw = cases.find((c) => OPEN.has(c.status));
    if (!raw) throw err(409, "NO_OPEN_CASE", "Request verification before adding evidence.");
    const existing = Number(raw.evidenceCount || 0);
    if (existing + refs.length > MAX_EVIDENCE_PER_CASE) {
        throw err(422, "EVIDENCE_LIMIT", `A case can hold at most ${MAX_EVIDENCE_PER_CASE} evidence references.`);
    }
    const now = new Date().toISOString();
    const saved = await writeEvidence(raw, refs, actorUid, now);
    const nextStatus = raw.status === VERIFICATION_STATES.INFO_REQUESTED ? VERIFICATION_STATES.UNDER_REVIEW : raw.status;
    const next = {
        ...raw,
        status: nextStatus,
        evidenceCount: existing + saved.length,
        history: [
            ...(raw.history || []),
            { at: now, actor: actorUid || "tenant", from: raw.status, to: nextStatus, note: `evidence_added:${saved.length}` },
        ],
    };
    await col.put(raw.caseId, next, { merge: false });
    if (nextStatus !== raw.status) await applyOutcome(companyId, next);
    return { caseId: next.caseId, status: next.status, evidence: saved.map(clientEvidence) };
}

/** Tenant view of its verification status (no evidence echo beyond what the tenant itself submitted). */
export async function getVerificationStatus(companyId) {
    const entity = await getOrgEntityByCompanyId(companyId);
    const cases = await listCasesForCompany(companyId);
    const latest = cases[0] || null;
    const evidence = latest ? (await listEvidenceForCase(latest.caseId)).map(clientEvidence) : [];
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
                decisionNote: ["rejected", "restricted", "info_requested"].includes(latest.status) ? latest.decisionNote || null : null,
                evidence,
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
 * @param {{ evidence?: object[] }} [opts] optional evidence references (https URL / external ref) to attach at submit time
 */
export async function submitVerification(companyId, actorUid = null, opts = {}) {
    const evidenceRefs = (Array.isArray(opts?.evidence) ? opts.evidence : []).map(normalizeEvidenceRef);
    if (evidenceRefs.length > MAX_EVIDENCE_PER_CASE) {
        throw err(422, "EVIDENCE_LIMIT", `A case can hold at most ${MAX_EVIDENCE_PER_CASE} evidence references.`);
    }
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
        evidenceCount: evidenceRefs.length,
        history: [{ at: now, actor: actorUid || "tenant", from: state, to: VERIFICATION_STATES.SUBMITTED, note: null }],
    };
    await col.put(kase.caseId, kase, { merge: false });
    if (evidenceRefs.length) await writeEvidence(kase, evidenceRefs, actorUid, now);
    await applyOutcome(companyId, kase);
    return kase;
}

/**
 * Officer decision (platform). Audited durably; never succeeds without an audit record.
 * @param {string} caseId
 * @param {{ action: keyof typeof TRANSITIONS, note?: string, checks?: string[] }} decision
 * @param {string} actor platform uid / "api_key"
 */
export async function decideVerification(caseId, rawDecision, actor) {
    const action = ACTION_ALIASES[rawDecision?.action] || rawDecision?.action;
    const decision = { ...(rawDecision || {}), action };
    const t = TRANSITIONS[action];
    if (!t) throw err(400, "VERIFICATION_ACTION_INVALID", `Unknown action. Use: ${[...Object.keys(TRANSITIONS), ...Object.keys(ACTION_ALIASES)].join(", ")}`);
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
        decidedAt: t.to === "under_review" || t.to === "info_requested" ? kase.decidedAt || null : now,
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

/** Platform case detail including attached evidence references (`evidenceRefs`). */
export async function getVerificationCase(caseId) {
    const raw = await col.get(caseId);
    if (!raw) return null;
    return { ...strip(raw), evidenceRefs: (await listEvidenceForCase(caseId)).map(clientEvidence) };
}

export function clearVerificationCasesForTests() {
    col.clearMemory();
    evidenceCol.clearMemory();
}
