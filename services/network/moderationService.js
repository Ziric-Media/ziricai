/**
 * SNET-10 — Trust & safety MVP: consumers report a network entity; platform moderators review and decide.
 *
 * Scope: reports about ENTITIES (impersonation, scam, spam, …). Message-content moderation and appeals are out of
 * scope. Reports are about listed entities only (a user can only report what they can see).
 * Privacy: the reporter is pseudonymous to the platform (`reporterRef`) and never visible to the reported business.
 * Humans decide: many reports raise priority, they never auto-suspend.
 *
 * System of record: `networkModerationCases/{caseId}`; decisions are audited durably (`networkAdminAudit`).
 */
import { createHash, randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { recordNetworkAdminAction } from "./networkAdminAudit.js";
import { getEntityBySnId } from "./networkIdentityService.js";
import { isValidSnId, snIdKind } from "./snId.js";
import { changeEntityStatus } from "./networkPlatformService.js";
import { assertCompanyDiscoverableAsync } from "../users/businessDirectoryService.js";

export const REPORT_REASONS = Object.freeze(["impersonation", "scam_or_fraud", "spam", "inappropriate_content", "wrong_information", "other"]);
export const MODERATION_STATUSES = Object.freeze({ OPEN: "open", REVIEWING: "reviewing", ACTIONED: "actioned", DISMISSED: "dismissed" });
const M = MODERATION_STATUSES;
const OPEN_SET = new Set([M.OPEN, M.REVIEWING]);

const MAX_REPORTS_PER_DAY = 10;
const HIGH_PRIORITY_REPORTERS = 3;
const DETAILS_MAX = 1000;

/** action → { from, to, needsNote } */
const DECISIONS = {
    start_review: { from: [M.OPEN], to: M.REVIEWING, needsNote: false },
    dismiss: { from: [M.OPEN, M.REVIEWING], to: M.DISMISSED, needsNote: true },
    suspend_entity: { from: [M.OPEN, M.REVIEWING], to: M.ACTIONED, needsNote: true },
};

const col = createNetworkCollection(NETWORK_COLLECTIONS.MODERATION_CASES);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function reporterRef(uid) {
    return createHash("sha256").update(`snet-report:${uid}`).digest("hex").slice(0, 10);
}

function strip(row) {
    if (!row) return null;
    const { __id, ...rest } = row;
    return rest;
}

/** Platform view: reporter pseudonymous, reporter uid never leaves the store. */
function toPlatformView(c, reportCount = null) {
    const { reporterUid, ...rest } = c;
    return { ...rest, reporterRef: reporterRef(reporterUid), ...(reportCount === null ? {} : { openReportsForEntity: reportCount }) };
}

/** Reporter view: status only. */
function toReporterView(c) {
    return {
        caseId: c.caseId,
        snId: c.snId,
        reason: c.reason,
        status: c.status === M.OPEN || c.status === M.REVIEWING ? "under_review" : "resolved",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
    };
}

/**
 * @param {string} uid reporter
 * @param {string} snId
 * @param {{ reason: string, details?: string }} input
 */
export async function reportEntity(uid, snId, input = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    if (!isValidSnId(snId) || snIdKind(snId) !== "org") throw err(400, "SN_ID_INVALID", "A valid organisation snId is required.");
    const reason = String(input.reason || "").trim();
    if (!REPORT_REASONS.includes(reason)) throw err(422, "REPORT_REASON_INVALID", `reason must be one of: ${REPORT_REASONS.join(", ")}`);
    const details = String(input.details || "").trim();
    if (details.length > DETAILS_MAX) throw err(422, "REPORT_DETAILS_TOO_LONG", `details must be at most ${DETAILS_MAX} characters.`);
    if (reason === "other" && details.length < 10) throw err(422, "REPORT_DETAILS_REQUIRED", "Please describe the problem (at least 10 characters).");

    const entity = await getEntityBySnId(snId);
    const companyId = entity?.refs?.companyId;
    if (!entity || !companyId) throw err(404, "ENTITY_NOT_FOUND", "Network entity not found.");
    await assertCompanyDiscoverableAsync(companyId); // can only report what is visible

    const mine = (await col.list({ where: [["reporterUid", "==", uid]], limit: 500 })).map(strip);
    const since = Date.now() - 24 * 3600 * 1000;
    if (mine.filter((c) => new Date(c.createdAt).getTime() > since).length >= MAX_REPORTS_PER_DAY) {
        throw err(429, "REPORT_RATE_LIMITED", "You have sent too many reports today. Try again tomorrow.");
    }
    const duplicate = mine.find((c) => c.snId === snId && OPEN_SET.has(c.status));
    if (duplicate) return { ...toReporterView(duplicate), duplicate: true };

    const now = new Date().toISOString();
    const kase = {
        caseId: `mc_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        snId,
        companyId,
        reporterUid: uid,
        reason,
        details,
        status: M.OPEN,
        createdAt: now,
        updatedAt: now,
        history: [{ at: now, actor: "reporter", from: null, to: M.OPEN, note: null }],
        schemaVersion: 1,
    };
    await col.put(kase.caseId, kase, { merge: false });
    return { ...toReporterView(kase), duplicate: false };
}

/** @param {string} uid */
export async function listMyReports(uid) {
    const rows = (await col.list({ where: [["reporterUid", "==", uid]], limit: 200 })).map(strip);
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(toReporterView);
}

async function openReporterCounts() {
    const rows = (await col.list({ limit: 1000 })).map(strip).filter((c) => OPEN_SET.has(c.status));
    const bySn = new Map();
    for (const c of rows) {
        if (!bySn.has(c.snId)) bySn.set(c.snId, new Set());
        bySn.get(c.snId).add(c.reporterUid);
    }
    return bySn;
}

/**
 * Platform queue: highest priority (most distinct open reporters) first, then oldest.
 * @param {{ status?: string, snId?: string, limit?: number }} [opts]
 */
export async function listModerationCases({ status = "", snId = "", limit = 100 } = {}) {
    const where = [];
    if (status) where.push(["status", "==", status]);
    if (snId) where.push(["snId", "==", snId]);
    const rows = (await col.list({ where, limit: 500 })).map(strip);
    const counts = await openReporterCounts();
    return rows
        .map((c) => {
            const n = counts.get(c.snId)?.size || 0;
            return { ...toPlatformView(c, n), priority: n >= HIGH_PRIORITY_REPORTERS ? "high" : "normal" };
        })
        .sort((a, b) => (a.priority === b.priority ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.priority === "high" ? -1 : 1))
        .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 200));
}

export async function getModerationCase(caseId) {
    const raw = strip(await col.get(caseId));
    if (!raw) return null;
    const counts = await openReporterCounts();
    return toPlatformView(raw, counts.get(raw.snId)?.size || 0);
}

/** Counts for MC overview. */
export async function getModerationStats() {
    const rows = (await col.list({ limit: 2000 })).map(strip);
    const byStatus = {};
    for (const c of rows) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    return { total: rows.length, open: (byStatus.open || 0) + (byStatus.reviewing || 0), byStatus };
}

/**
 * @param {string} caseId
 * @param {{ action: keyof typeof DECISIONS, note?: string }} decision
 * @param {string} actor
 */
export async function decideModerationCase(caseId, decision, actor) {
    const t = DECISIONS[decision?.action];
    if (!t) throw err(400, "MODERATION_ACTION_INVALID", `Unknown action. Use: ${Object.keys(DECISIONS).join(", ")}`);
    const kase = strip(await col.get(caseId));
    if (!kase) throw err(404, "CASE_NOT_FOUND", "Moderation case not found.");
    if (!t.from.includes(kase.status)) throw err(409, "MODERATION_STATE_INVALID", `Cannot ${decision.action} a case that is ${kase.status}.`);
    const note = String(decision.note || "").trim();
    if (t.needsNote && note.length < 5) throw err(422, "NOTE_REQUIRED", "A decision note (min 5 characters) is required.");

    let entityResult = null;
    if (decision.action === "suspend_entity") {
        try {
            entityResult = await changeEntityStatus(kase.snId, "suspend", { reason: `Moderation case ${caseId}: ${note}`, actor });
        } catch (e) {
            if (e.code !== "ENTITY_STATE_INVALID") throw e; // already suspended is fine — still resolve the case
        }
    }

    const now = new Date().toISOString();
    const next = {
        ...kase,
        status: t.to,
        updatedAt: now,
        decisionNote: note || kase.decisionNote || null,
        decidedBy: t.to === M.REVIEWING ? kase.decidedBy || null : actor,
        decidedAt: t.to === M.REVIEWING ? kase.decidedAt || null : now,
        history: [...(kase.history || []), { at: now, actor, from: kase.status, to: t.to, note: note || null }],
    };
    await col.put(caseId, next, { merge: false });
    await recordNetworkAdminAction({
        actor,
        action: `moderation.${decision.action}`,
        snId: kase.snId,
        companyId: kase.companyId,
        detail: { caseId, from: kase.status, to: t.to, reason: kase.reason, note: note || null, entitySuspended: Boolean(entityResult) },
    });
    return toPlatformView(next);
}

export function clearModerationCasesForTests() {
    col.clearMemory();
}
