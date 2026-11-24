/**
 * SW-03b — Sarah Work approval queue (Levels 2 & 3).
 */
import { appendWorkActivity } from "./personalSarahWorkWorkspace.js";
import crypto from "node:crypto";

function userBrief(session) {
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    return msgs
        .filter((m) => m.role === "user")
        .map((m) => String(m.content || "").trim())
        .filter(Boolean)
        .join("\n");
}

function fingerprintFor(details) {
    return crypto.createHash("sha256").update(JSON.stringify(details)).digest("hex").slice(0, 16);
}

function ensureApprovalsArray(session) {
    if (!session.workWorkspace || typeof session.workWorkspace !== "object") {
        session.workWorkspace = { approvals: [] };
    }
    if (!Array.isArray(session.workWorkspace.approvals)) {
        session.workWorkspace.approvals = [];
    }
    return session.workWorkspace.approvals;
}

/**
 * Infer Level 2/3 approvals from assignment brief (v1 heuristics).
 * @param {object} session
 */
export function ensureWorkApprovalsOnSubmit(session) {
    if (!session || session.mode !== "work") return [];
    const brief = userBrief(session);
    const lower = brief.toLowerCase();
    const approvals = ensureApprovalsArray(session);
    const created = [];

    const level3 = /\b(pay|payment|purchase|buy|sign|signature|contract|commit|transfer)\b/.test(lower);
    const level2 =
        !level3 &&
        /\b(send|email|e-mail|book|schedule|call|text|message|invite|contact|notify)\b/.test(lower);

    if (level3) {
        const details = {
            action: "financial_or_binding_commitment",
            briefExcerpt: brief.slice(0, 400),
            amount: (brief.match(/\b(?:r|zar)\s*[\d,]+(?:\.\d{2})?/i) || [])[0] || null,
            recipient: (brief.match(/(?:to|for)\s+[\w.@+-]{3,}/i) || [])[0] || null,
        };
        const fp = fingerprintFor(details);
        if (!approvals.some((a) => a.status === "pending" && a.fingerprint === fp)) {
            const row = {
                id: `apr-${Date.now()}-l3`,
                level: 3,
                status: "pending",
                actionType: "financial_commitment",
                summary: "Approve external commitment (payment, purchase, or signature)",
                details,
                fingerprint: fp,
                requestedAt: new Date().toISOString(),
                resolvedAt: null,
                resolution: null,
                resolutionNote: null,
            };
            approvals.push(row);
            created.push(row);
            appendWorkActivity(session, {
                kind: "approval_requested",
                label: "Level 3 approval required",
                milestoneId: null,
            });
        }
    } else if (level2) {
        const channel = /\bemail|e-mail\b/.test(lower)
            ? "email"
            : /\bbook|schedule\b/.test(lower)
              ? "booking"
              : /\bcall|phone\b/.test(lower)
                ? "phone"
                : "message";
        const details = {
            action: "outbound_communication",
            channel,
            briefExcerpt: brief.slice(0, 400),
            recipient: (brief.match(/(?:to|for)\s+[\w.@+-]{3,}/i) || [])[0] || null,
        };
        const fp = fingerprintFor(details);
        if (!approvals.some((a) => a.status === "pending" && a.fingerprint === fp)) {
            const row = {
                id: `apr-${Date.now()}-l2`,
                level: 2,
                status: "pending",
                actionType: "outbound_communication",
                summary: `Approve before Sarah sends or books (${channel})`,
                details,
                fingerprint: fp,
                requestedAt: new Date().toISOString(),
                resolvedAt: null,
                resolution: null,
                resolutionNote: null,
            };
            approvals.push(row);
            created.push(row);
            appendWorkActivity(session, {
                kind: "approval_requested",
                label: "Level 2 approval requested",
                milestoneId: null,
            });
        }
    }

    session.workWorkspace.approvals = approvals.slice(-20);
    return created;
}

/**
 * @param {object} session
 * @param {{ minLevel?: number, status?: string }} [opts]
 */
export function listWorkApprovals(session, opts = {}) {
    const minLevel = Number(opts.minLevel) || 1;
    const status = opts.status || null;
    const rows = ensureApprovalsArray(session);
    return rows.filter((a) => {
        if (Number(a.level) < minLevel) return false;
        if (status && a.status !== status) return false;
        return true;
    });
}

export function hasBlockingLevel3Approval(session) {
    return listWorkApprovals(session, { minLevel: 3, status: "pending" }).length > 0;
}

export function hasPendingLevel2Approval(session) {
    return listWorkApprovals(session, { minLevel: 2, status: "pending" }).length > 0;
}

/**
 * @param {object} session
 * @param {string} approvalId
 * @param {{ decision: 'approved'|'rejected', note?: string }} input
 */
export function resolveWorkApproval(session, approvalId, input) {
    const decision = input?.decision === "approved" ? "approved" : "rejected";
    const note = String(input?.note || "").trim().slice(0, 500) || null;
    const approvals = ensureApprovalsArray(session);
    const row = approvals.find((a) => a.id === approvalId);
    if (!row) return { ok: false, code: "APPROVAL_NOT_FOUND" };
    if (row.status !== "pending") return { ok: false, code: "APPROVAL_ALREADY_RESOLVED", approval: row };

    row.status = decision;
    row.resolution = decision;
    row.resolutionNote = note;
    row.resolvedAt = new Date().toISOString();

    appendWorkActivity(session, {
        kind: `approval_${decision}`,
        label: `Level ${row.level} approval ${decision}`,
        milestoneId: null,
    });

    return { ok: true, approval: row };
}

export function assertOutboundApprovalForDeliverable(session) {
    if (!hasPendingLevel2Approval(session)) return { allowed: true };
    return {
        allowed: false,
        code: "WORK_APPROVAL_REQUIRED",
        level: 2,
        message: "Approve the outbound action before the deliverable is released externally.",
    };
}