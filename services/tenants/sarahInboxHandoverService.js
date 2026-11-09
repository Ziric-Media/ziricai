/**
 * CH6/CH7 — Sarah App inbox assignment queue, accept, transfer, escalate, return.
 */
import { HANDOVER_STATES } from "../users/messagingContracts.js";
import { setHumanTakeover } from "./conversationService.js";
import { appendUserConversationMessage, getUserConversationByCompany, openUserConversation } from "../users/userConversationService.js";
import { MESSAGE_ROLES } from "../users/identityContracts.js";
import { resolveSarahAppUidFromRef } from "../conversation/tenantConversationRef.js";
import { auditLog } from "../audit/auditLog.js";

/** @type {Map<string, object>} */
const metaByConversation = new Map();

function metaKey(companyId, conversationId) {
    return `${companyId}::${conversationId}`;
}

export function getHandoverMeta(companyId, conversationId) {
    return (
        metaByConversation.get(metaKey(companyId, conversationId)) || {
            assignmentState: "unassigned",
            assignedEmployeeId: null,
            assignedEmployeeName: null,
            queueStatus: null,
            escalationLevel: 0,
            handoverSummary: null,
            acceptedBy: null,
            acceptedAt: null,
            transferredFrom: null,
        }
    );
}

function setMeta(companyId, conversationId, patch) {
    const key = metaKey(companyId, conversationId);
    const next = { ...getHandoverMeta(companyId, conversationId), ...patch, updatedAt: new Date().toISOString() };
    metaByConversation.set(key, next);
    return next;
}

async function syncConsumerOwnership(companyId, conversationId, ownershipState, employeeId = null) {
    const uid = resolveSarahAppUidFromRef(conversationId);
    if (!uid) return;
    await openUserConversation(uid, companyId, {});
    const conv = getUserConversationByCompany(uid, companyId);
    if (!conv) return;
    conv.ownershipState = ownershipState;
    if (employeeId !== undefined) conv.assignedEmployeeId = employeeId;
}

export async function enqueueSarahAppHandover(companyId, conversationId, { reason = "", summary = "" } = {}) {
    const meta = setMeta(companyId, conversationId, {
        queueStatus: "awaiting_assignment",
        assignmentState: HANDOVER_STATES.AWAITING_ASSIGNMENT,
        handoverSummary: summary || reason || "Customer requested a human.",
    });
    await syncConsumerOwnership(companyId, conversationId, HANDOVER_STATES.AWAITING_ASSIGNMENT);
    auditLog("chat_handover_enqueued", { companyId, conversationId, meta });
    return meta;
}

export async function assignSarahAppConversation(companyId, conversationId, { employeeId, humanAgent } = {}) {
    const assignee = String(employeeId || humanAgent || "staff").trim();
    const label = String(humanAgent || assignee).trim();
    await setHumanTakeover(companyId, conversationId, { enabled: true, humanAgent: label });
    const meta = setMeta(companyId, conversationId, {
        assignmentState: HANDOVER_STATES.HUMAN_ASSIGNED,
        assignedEmployeeId: assignee,
        assignedEmployeeName: label,
        queueStatus: "awaiting_accept",
    });
    await syncConsumerOwnership(companyId, conversationId, HANDOVER_STATES.HUMAN_ASSIGNED, assignee);
    auditLog("chat_handover_assigned", { companyId, conversationId, assignee });
    return meta;
}

export async function acceptSarahAppConversation(companyId, conversationId, { employeeId, humanAgent } = {}) {
    const acceptor = String(employeeId || humanAgent || "staff").trim();
    await setHumanTakeover(companyId, conversationId, { enabled: true, humanAgent: acceptor });
    const meta = setMeta(companyId, conversationId, {
        assignmentState: HANDOVER_STATES.HUMAN_ACTIVE,
        acceptedBy: acceptor,
        acceptedAt: new Date().toISOString(),
        queueStatus: "active",
    });
    await syncConsumerOwnership(companyId, conversationId, HANDOVER_STATES.HUMAN_ACTIVE, acceptor);
    const uid = resolveSarahAppUidFromRef(conversationId);
    if (uid) {
        const conv = getUserConversationByCompany(uid, companyId);
        if (conv) {
            await appendUserConversationMessage(conv, {
                role: MESSAGE_ROLES.SYSTEM,
                content: "A team member accepted your chat.",
                source: "handover",
                authorParticipantId: "system",
            });
        }
    }
    auditLog("chat_handover_accepted", { companyId, conversationId, acceptor });
    return meta;
}

export async function transferSarahAppConversation(
    companyId,
    conversationId,
    { targetEmployeeId, humanAgent, note = "" } = {}
) {
    const target = String(targetEmployeeId || humanAgent || "staff").trim();
    const meta = setMeta(companyId, conversationId, {
        assignedEmployeeId: target,
        assignedEmployeeName: target,
        transferredFrom: getHandoverMeta(companyId, conversationId).assignedEmployeeId,
        assignmentState: HANDOVER_STATES.HUMAN_ASSIGNED,
        queueStatus: "awaiting_accept",
        handoverSummary: note || getHandoverMeta(companyId, conversationId).handoverSummary,
    });
    await setHumanTakeover(companyId, conversationId, { enabled: true, humanAgent: target });
    await syncConsumerOwnership(companyId, conversationId, HANDOVER_STATES.HUMAN_ASSIGNED, target);
    auditLog("chat_handover_transferred", { companyId, conversationId, target });
    return meta;
}

export async function escalateSarahAppConversation(companyId, conversationId, { reason = "Escalated", level = 1 } = {}) {
    const prev = getHandoverMeta(companyId, conversationId);
    const meta = setMeta(companyId, conversationId, {
        escalationLevel: Math.max(prev.escalationLevel || 0, Number(level) || 1),
        queueStatus: "escalated",
        handoverSummary: `${prev.handoverSummary || ""} · Escalation: ${reason}`.trim(),
    });
    const uid = resolveSarahAppUidFromRef(conversationId);
    if (uid) {
        const conv = getUserConversationByCompany(uid, companyId);
        if (conv) {
            await appendUserConversationMessage(conv, {
                role: MESSAGE_ROLES.SYSTEM,
                content: "Your conversation was escalated to a senior team member.",
                source: "handover",
                authorParticipantId: "system",
            });
        }
    }
    auditLog("chat_handover_escalated", { companyId, conversationId, reason, level });
    return meta;
}

export async function returnSarahAppToAi(companyId, conversationId, { reason = "" } = {}) {
    await setHumanTakeover(companyId, conversationId, { enabled: false });
    const meta = setMeta(companyId, conversationId, {
        assignmentState: HANDOVER_STATES.AI_ACTIVE_AGAIN,
        queueStatus: "ai_resume_pending",
        assignedEmployeeId: null,
        acceptedBy: null,
    });
    await syncConsumerOwnership(companyId, conversationId, HANDOVER_STATES.AI_ACTIVE_AGAIN, null);
    const uid = resolveSarahAppUidFromRef(conversationId);
    if (uid) {
        const conv = getUserConversationByCompany(uid, companyId);
        if (conv) {
            await appendUserConversationMessage(conv, {
                role: MESSAGE_ROLES.SYSTEM,
                content: reason
                    ? `Company Sarah is assisting again. (${reason})`
                    : "Company Sarah is assisting you again.",
                source: "handover",
                authorParticipantId: "system",
            });
        }
    }
    auditLog("chat_handover_return_ai", { companyId, conversationId, reason });
    return meta;
}

export function buildSarahHandoverSummary(conversation, messages = []) {
    const recent = messages
        .slice(-8)
        .map((m) => `${m.role || m.source || "msg"}: ${String(m.content || m.message || "").slice(0, 120)}`)
        .join(" | ");
    return {
        customerName: conversation?.customerName || conversation?.name || "Customer",
        channel: conversation?.channel || "sarah_app",
        lastPreview: conversation?.preview || conversation?.lastMessage || "",
        recentTranscript: recent,
        generatedAt: new Date().toISOString(),
    };
}

export function listAwaitingAcceptQueue(companyId) {
    return [...metaByConversation.entries()]
        .filter(([key, meta]) => key.startsWith(`${companyId}::`) && meta.queueStatus === "awaiting_accept")
        .map(([key, meta]) => ({
            conversationId: key.split("::").slice(1).join("::"),
            ...meta,
        }));
}

export function clearSarahInboxHandoverForTests() {
    metaByConversation.clear();
}
