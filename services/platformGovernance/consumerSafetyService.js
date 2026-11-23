/**
 * MC-PO-04 — consumer trust & safety cases (not message-content moderation).
 */
import { randomUUID } from "node:crypto";
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { getConsumerProfile, patchConsumerPlatformSafety } from "../users/consumerProfileService.js";
import { recordPlatformAdminAudit } from "./platformAdminAuditService.js";

const col = createNetworkCollection(PLATFORM_GOVERNANCE.CONSUMER_SAFETY_CASES);

export const SAFETY_DECISIONS = Object.freeze([
    "open",
    "dismiss",
    "warn",
    "restrict_messaging",
    "restrict_status",
    "suspend",
    "terminate",
]);

const ENFORCEMENT = {
    warn: { level: 1, status: "warned" },
    restrict_messaging: { level: 2, status: "restricted", restrictions: ["messaging"] },
    restrict_status: { level: 2, status: "restricted", restrictions: ["status_publish"] },
    suspend: { level: 3, status: "suspended" },
    terminate: { level: 5, status: "terminated" },
};

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export async function listConsumerSafetyCases({ status = "", limit = 100 } = {}) {
    const rows = await col.list({ limit: Math.min(limit, 500) });
    return rows
        .filter((r) => !status || r.status === status)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getConsumerSafetyCase(caseId) {
    const row = await col.get(caseId);
    if (!row) throw err(404, "CASE_NOT_FOUND", "Case not found.");
    return row;
}

/**
 * @param {{ subjectUid: string, reason: string, details?: string, actorUid?: string }} input
 */
export async function createConsumerSafetyCase(input) {
    const subjectUid = String(input.subjectUid || "").trim();
    if (!subjectUid) throw err(422, "SUBJECT_REQUIRED", "subjectUid is required.");
    const profile = await getConsumerProfile(subjectUid);
    if (!profile) throw err(404, "CONSUMER_NOT_FOUND", "Consumer profile not found.");
    const reason = String(input.reason || "").trim();
    if (reason.length < 5) throw err(422, "REASON_REQUIRED", "A reason of at least 5 characters is required.");
    const caseId = randomUUID();
    const now = new Date().toISOString();
    const row = {
        caseId,
        subjectUid,
        status: "open",
        reason,
        details: input.details ? String(input.details).slice(0, 2000) : null,
        enforcementLevel: 0,
        decisions: [],
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
    };
    await col.put(caseId, row, { merge: false });
    await recordPlatformAdminAudit({
        action: "consumer_safety.case_opened",
        actorUid: input.actorUid,
        targetType: "consumer",
        targetId: subjectUid,
        note: reason,
        meta: { caseId },
    });
    return row;
}

/**
 * @param {string} caseId
 * @param {{ decision: string, note?: string, actorUid?: string }} input
 */
export async function decideConsumerSafetyCase(caseId, input) {
    const row = await getConsumerSafetyCase(caseId);
    const decision = String(input.decision || "").trim();
    if (!SAFETY_DECISIONS.includes(decision)) {
        throw err(422, "DECISION_INVALID", `decision must be one of: ${SAFETY_DECISIONS.join(", ")}`);
    }
    const note = String(input.note || "").trim();
    if (["warn", "suspend", "terminate", "restrict_messaging", "restrict_status"].includes(decision) && note.length < 5) {
        throw err(422, "NOTE_REQUIRED", "A note of at least 5 characters is required for this decision.");
    }
    const now = new Date().toISOString();
    const decisions = [
        ...(row.decisions || []),
        { decision, note: note || null, actorUid: input.actorUid || null, at: now },
    ];
    let status = row.status;
    let enforcementLevel = row.enforcementLevel ?? 0;
    if (decision === "dismiss") status = "dismissed";
    else if (decision !== "open") status = "actioned";

    const enforcement = ENFORCEMENT[decision];
    if (enforcement) {
        enforcementLevel = enforcement.level;
        await patchConsumerPlatformSafety(row.subjectUid, {
            status: enforcement.status,
            level: enforcement.level,
            restrictions: enforcement.restrictions || row.restrictions || [],
            lastCaseId: caseId,
            lastDecision: decision,
            lastNote: note || null,
        });
    }

    const next = { ...row, status, enforcementLevel, decisions, updatedAt: now };
    await col.put(caseId, next, { merge: false });
    await recordPlatformAdminAudit({
        action: `consumer_safety.${decision}`,
        actorUid: input.actorUid,
        targetType: "consumer",
        targetId: row.subjectUid,
        note,
        meta: { caseId },
    });
    return next;
}

export function clearConsumerSafetyForTests() {
    col.clearMemory();
}
