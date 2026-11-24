/**
 * SW-03 — Sarah Trust hooks for Sarah Work outbound / commitment actions.
 */
import { listWorkApprovals, hasBlockingLevel3Approval, hasPendingLevel2Approval } from "./personalSarahWorkApprovals.js";
import { mergeWorkAssignmentSettings } from "./personalSarahWorkSettings.js";

export const WORK_TRUST_ACTION_TYPES = [
    "outbound_communication",
    "booking",
    "payment",
    "purchase",
    "signature",
    "external_commitment",
];

/**
 * @param {object} session
 * @returns {{ level: number, actions: string[], blocked: boolean, reason?: string }}
 */
export function assessWorkTrustSurface(session) {
    const settings = mergeWorkAssignmentSettings(session);
    const actions = [];
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    const brief = msgs
        .filter((m) => m.role === "user")
        .map((m) => String(m.content || ""))
        .join("\n")
        .toLowerCase();

    if (/\b(pay|payment|purchase|buy|sign|signature|contract|transfer)\b/.test(brief)) {
        actions.push("payment", "signature", "external_commitment");
    }
    if (/\b(send|email|e-mail|call|text|message|invite|contact|notify)\b/.test(brief)) {
        actions.push("outbound_communication");
    }
    if (/\b(book|schedule|appointment)\b/.test(brief)) {
        actions.push("booking");
    }

    let level = settings.defaultApprovalLevel || 1;
    if (actions.some((a) => ["payment", "purchase", "signature", "external_commitment"].includes(a))) level = 3;
    else if (actions.some((a) => ["outbound_communication", "booking"].includes(a))) level = Math.max(level, 2);

    const blocked =
        settings.sarahTrustOutbound === "block"
            ? true
            : hasBlockingLevel3Approval(session) || (level >= 2 && hasPendingLevel2Approval(session));

    let reason;
    if (hasBlockingLevel3Approval(session)) {
        reason = "Level 3 Sarah Trust approval required (payment, purchase, or signature).";
    } else if (level >= 2 && hasPendingLevel2Approval(session)) {
        reason = "Level 2 Sarah Trust approval required before Sarah may act externally.";
    } else if (settings.sarahTrustOutbound === "block") {
        reason = "Outbound actions are blocked for this assignment.";
    }

    return { level, actions: [...new Set(actions)], blocked, reason };
}

/**
 * Returns outbound execution permission for runner/tools (no side effects).
 * @param {object} session
 */
export function assertWorkTrustForOutbound(session) {
    const surface = assessWorkTrustSurface(session);
    if (surface.blocked) {
        return { allowed: false, code: "WORK_TRUST_BLOCKED", ...surface };
    }
    if (surface.level >= 3) {
        return { allowed: false, code: "WORK_TRUST_L3_REQUIRED", ...surface };
    }
  if (surface.level >= 2 && hasPendingLevel2Approval(session)) {
        return { allowed: false, code: "WORK_TRUST_L2_REQUIRED", ...surface };
    }
    return { allowed: true, ...surface };
}

export function serializeWorkTrustSummary(session) {
    const surface = assessWorkTrustSurface(session);
    const pending = listWorkApprovals(session, { status: "pending", minLevel: 2 });
    return {
        ...surface,
        pendingApprovals: pending.length,
        settings: mergeWorkAssignmentSettings(session),
    };
}