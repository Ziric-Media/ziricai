/**
 * U2 — Personal Sarah API (Sarah App only).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { handlePersonalSarahChat } from "../sarah/personal/personalSarahOrchestrator.js";
import {
    getLatestPersonalSarahSession,
    listPersonalSarahSessions,
    createPersonalSarahSession,
    getPersonalSarahSessionForUser,
    serializePersonalSarahSessionDetail,
} from "../sarah/personal/personalSarahSessionStore.js";
import { reserveConsumerChatTurn } from "../revenue/consumerDailyChatUsage.js";
import { reserveConsumerWorkTask, getConsumerWorkTaskUsage, releaseConsumerWorkTask } from "../revenue/consumerWorkTaskUsage.js";
import {
    recordShadowSarahCredits,
    getConsumerSarahCreditShadowSummary,
    getConsumerSarahCreditUsageExport,
    assertConsumerSarahCreditsForRequest,
} from "../revenue/consumerSarahCreditMeter.js";
import { deliverDuePersonalReminders } from "../sarah/personal/personalSarahReminderDelivery.js";
import { deliverGeofenceReminders } from "../sarah/personal/personalSarahGeofenceService.js";
import {
    createPersonalReminderFromApi,
    listPersonalReminders,
} from "../sarah/personal/personalSarahTaskStore.js";
import { persistPersonalSarahSession } from "../sarah/personal/personalSarahSessionStore.js";
import { getSarahNewsProfile, setSarahNewsProfile } from "../sarah/news/sarahNewsProfileService.js";
import { compileSarahNewsEdition } from "../sarah/news/sarahNewsEditionService.js";
import { getSarahNewsStoryForUser } from "../sarah/news/sarahNewsIntelligenceService.js";
import { pollSarahNewsDeliveryForUser } from "../sarah/news/sarahNewsDeliveryService.js";
import { executePersonalSarahWorkRun } from "../sarah/personal/personalSarahWorkRunner.js";
import { allocateWorkBudgetForSession } from "../sarah/personal/personalSarahWorkBudget.js";
import {
    buildWorkDeliverables,
    buildWorkReferenceFiles,
    resolveWorkDeliverableBody,
} from "../sarah/personal/personalSarahWorkArtifacts.js";
import {
    ensureWorkApprovalsOnSubmit,
    listWorkApprovals,
    resolveWorkApproval,
    hasBlockingLevel3Approval,
    hasPendingLevel2Approval,
} from "../sarah/personal/personalSarahWorkApprovals.js";
import { buildPersonalSarahWorkHome } from "../sarah/personal/personalSarahWorkHomeService.js";
import { appendWorkActivity, syncWorkWorkspace, listWorkCapabilityCatalog } from "../sarah/personal/personalSarahWorkWorkspace.js";
import { mergeWorkAssignmentSettings } from "../sarah/personal/personalSarahWorkSettings.js";
import { assertWorkConcurrentCapacity } from "../sarah/personal/personalSarahWorkConcurrent.js";
import {
    notifyWorkAssignmentStarted,
    notifyWorkNeedsApproval,
} from "../sarah/personal/personalSarahWorkNotifications.js";
import { aggregateSarahWorkForUser } from "../sarah/personal/personalSarahWorkMcStats.js";
import { getConsumerEntitlements } from "../revenue/entitlementEngine.js";
import { auditLog } from "../audit/auditLog.js";
import { enrichMessageWithAttachments } from "../users/chatAttachmentUnderstanding.js";
import { getSarahHomeCards } from "../sarah/home/sarahHomeIntelligenceService.js";

const personalSarahRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handlePersonalSarahChatRequest(req, res) {
    try {
        const enriched = await enrichMessageWithAttachments(req.body?.message, req.body?.attachments);
        if (!enriched.modelContext) {
            return res.status(400).json({ error: "message or attachment is required", code: "MESSAGE_REQUIRED" });
        }

        const uid = req.consumerAuth.uid;
        const creditGate = await assertConsumerSarahCreditsForRequest(uid, {
            ...(req.body?.preferences?.mode === "work" ? { archetype: "WORK-STEP" } : { archetype: "CHAT-TURN" }),
            surface: "chat",
        });
        if (!creditGate.allowed) {
            const creditsShadow = await getConsumerSarahCreditShadowSummary(uid);
            return res.status(429).json({
                error: "Your monthly allowance and top-up credits are used up. Buy a top-up or wait for your plan to renew.",
                code: creditGate.code || "CREDITS_EXHAUSTED",
                resumeHint: creditGate.resumeHint || "top_up_or_renewal",
                creditsShadow,
            });
        }
        const quota = await reserveConsumerChatTurn(uid);
        if (!quota.allowed) {
            auditLog("personal_sarah_chat_quota", {
                uid,
                usage: quota.usage,
                limit: quota.limit,
                dayKey: quota.dayKey,
            });
            return res.status(429).json({
                error: "Daily Personal Sarah chat limit reached for your plan.",
                code: "CHAT_QUOTA_EXCEEDED",
                usage: quota.usage,
                limit: quota.limit,
                dayKey: quota.dayKey,
            });
        }

        const sessionId = req.body?.sessionId || null;
        if (sessionId) {
            const owned = await getPersonalSarahSessionForUser(uid, sessionId);
            if (!owned) {
                return res.status(404).json({
                    error: "Conversation not found",
                    code: "SESSION_NOT_FOUND",
                });
            }
        }

        const result = await handlePersonalSarahChat(
            {
                uid,
                consumerProfile: req.consumerAuth.profile,
                preferences: req.body?.preferences || null,
            },
            {
                message: enriched.modelContext,
                displayMessage: enriched.text,
                attachments: enriched.attachments,
                sessionId,
            }
        );
        const creditsShadow = await recordShadowSarahCredits(uid, {
            ...(result.metering || {}),
            surface: result.sessionSurface || "chat",
            sessionId: result.sessionId || sessionId || null,
            messagePreview: enriched.text || req.body?.message || "",
            interaction: result.sessionSurface === "work" ? "work_message" : "chat_message",
        });
        auditLog("personal_sarah_chat", {
            uid,
            sessionId: result.sessionId,
            mode: result.mode,
            quotaUsage: quota.usage,
            creditsShadow,
        });
        const creditSummary = await getConsumerSarahCreditShadowSummary(uid);
        res.json({
            ...result,
            quota: {
                usage: quota.usage,
                limit: quota.limit,
                enforcementMode: quota.enforcementMode,
            },
            creditsShadow: creditSummary,
            creditsLast: creditsShadow,
        });
    } catch (err) {
        console.error("[api/personal-sarah/chat]", err.message);
        res.status(500).json({ error: err.message || "Personal Sarah failed", code: "PERSONAL_SARAH_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleListPersonalSarahSessions(req, res) {
    try {
        const sessions = await listPersonalSarahSessions(req.consumerAuth.uid);
        res.json({ sessions });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to list sessions", code: "SESSION_LIST_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleCreatePersonalSarahSession(req, res) {
    try {
        const mode = String(req.body?.mode || "").trim().toLowerCase();
        const title = req.body?.title ? String(req.body.title).trim() : undefined;
        const session = await createPersonalSarahSession(req.consumerAuth.uid, { title, mode: mode || "chat" });
        if (!session) {
            return res.status(500).json({ error: "Could not create session", code: "SESSION_CREATE_ERROR" });
        }
        auditLog("personal_sarah_session_create", { uid: req.consumerAuth.uid, sessionId: session.id });
        res.status(201).json({ session: serializePersonalSarahSessionDetail(session) });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to create session", code: "SESSION_CREATE_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetPersonalSarahSession(req, res) {
    try {
        const sessionId = String(req.params?.id || "").trim();
        if (!sessionId) {
            return res.status(400).json({ error: "Session id required", code: "SESSION_ID_REQUIRED" });
        }
        const session = await getPersonalSarahSessionForUser(req.consumerAuth.uid, sessionId);
        if (!session) {
            return res.status(404).json({
                error: "Conversation not found",
                code: "SESSION_NOT_FOUND",
            });
        }
        res.json({ session: serializePersonalSarahSessionDetail(session) });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to load session", code: "SESSION_LOAD_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetActivePersonalSarahSession(req, res) {
    try {
        const session = await getLatestPersonalSarahSession(req.consumerAuth.uid);
        if (!session) {
            return res.json({ session: null });
        }
        res.json({
            session: serializePersonalSarahSessionDetail(session),
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to load session", code: "SESSION_LOAD_ERROR" });
    }
}

/**
 * @param {import('express').Express} app
 */
export async function handleSubmitPersonalSarahWork(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        if (!sessionId) {
            return res.status(400).json({ error: "Session id required", code: "SESSION_ID_REQUIRED" });
        }
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        if (session.workSubmittedAt) {
            return res.json({ session: serializePersonalSarahSessionDetail(session), alreadySubmitted: true });
        }
        const workBudget = await allocateWorkBudgetForSession(uid, session);
        const creditGate = await assertConsumerSarahCreditsForRequest(uid, { archetype: "WORK-SUBMIT", surface: "work" });
        if (!creditGate.allowed) {
            const creditsShadow = await getConsumerSarahCreditShadowSummary(uid);
            return res.status(403).json({
                error: "Sarah Work is paused — not enough AI credits. Buy a top-up or wait for renewal.",
                code: creditGate.code || "CREDITS_EXHAUSTED",
                resumeHint: creditGate.resumeHint || "top_up_or_renewal",
                creditsShadow,
                workPaused: true,
            });
        }
        const concurrent = await assertWorkConcurrentCapacity(uid, sessionId);
        if (!concurrent.allowed) {
            return res.status(403).json({
                error: concurrent.message || "Too many assignments in progress",
                code: concurrent.code || "WORK_CONCURRENT_CAP",
                active: concurrent.active,
                cap: concurrent.cap,
            });
        }
        const quota = await reserveConsumerWorkTask(uid);
        if (!quota.allowed) {
            return res.status(403).json({
                error: "Sarah Work is not included on your plan, or your task allowance is used up.",
                code: quota.limit <= 0 ? "WORK_NOT_INCLUDED" : "WORK_QUOTA_EXCEEDED",
                usage: quota.usage,
                limit: quota.limit,
                dayKey: quota.dayKey,
            });
        }
        session.workSubmittedAt = new Date().toISOString();
        session.workQuotaDayKey = quota.dayKey;
        session.workBudgetBand = workBudget.band;
        session.workBudgetCapCredits = workBudget.capCredits;
        session.workBudgetEstimateMin = workBudget.estimateRange.min;
        session.workBudgetEstimateMax = workBudget.estimateRange.max;
        session.workCreditsUsedCredits = 0;
        session.workPausedAt = null;
        session.workPauseReason = null;
        session.status = "running";
        const approvalsCreated = ensureWorkApprovalsOnSubmit(session);
        appendWorkActivity(session, { kind: "submit", label: "You submitted this assignment to Sarah" });
        syncWorkWorkspace(session);
        await persistPersonalSarahSession(session);
        if (approvalsCreated.length) void notifyWorkNeedsApproval(session);
        void notifyWorkAssignmentStarted(session);
        auditLog("personal_sarah_work_submit", { uid, sessionId });
        void executePersonalSarahWorkRun(session)
            .then(async (out) => {
                const steps = Array.isArray(out?.meteringSteps) ? out.meteringSteps : out?.metering ? [out.metering] : [];
                for (const stepMeter of steps) {
                    await recordShadowSarahCredits(uid, {
                        ...stepMeter,
                        surface: "work",
                        sessionId,
                        interaction: "work_step",
                        messagePreview: session.title || "Sarah Work",
                    });
                }
                if (steps.length) await persistPersonalSarahSession(session);
            })
            .catch((err) => console.warn("[personalSarahWorkRunner]", sessionId, err?.message || err));
        const creditsShadow = await recordShadowSarahCredits(uid, {
            archetype: "WORK-SUBMIT",
            surface: "work",
            sessionId,
            interaction: "work_submit",
            messagePreview: session.title || "Sarah Work",
        });
        session.workCreditsUsedCredits = Number(creditsShadow?.credits) || 0;
        await persistPersonalSarahSession(session);
        res.json({
            session: serializePersonalSarahSessionDetail(session),
            quota: { usage: quota.usage, limit: quota.limit, dayKey: quota.dayKey, creditsPrimary: quota.creditsPrimary },
            workBudget: {
                band: workBudget.band,
                bandLabel: workBudget.bandLabel,
                capCredits: workBudget.capCredits,
                estimateMin: workBudget.estimateRange.min,
                estimateMax: workBudget.estimateRange.max,
                remainingCredits: workBudget.remainingCredits,
            },
            workRun: "started",
            creditsLast: creditsShadow,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Work submit failed", code: "WORK_SUBMIT_ERROR" });
    }
}

/**
 * Cancel a submitted work task before Sarah completes it — restores the daily work quota once.
 * @param {string} uid
 * @param {string} sessionId
 */
export async function cancelPersonalSarahWorkSession(uid, sessionId) {
    if (!uid) {
        const e = new Error("Sign in required");
        e.status = 401;
        e.code = "AUTH_REQUIRED";
        throw e;
    }
    const id = String(sessionId || "").trim();
    if (!id) {
        const e = new Error("Session id required");
        e.status = 400;
        e.code = "SESSION_ID_REQUIRED";
        throw e;
    }
    const session = await getPersonalSarahSessionForUser(uid, id);
    if (!session) {
        const e = new Error("Conversation not found");
        e.status = 404;
        e.code = "SESSION_NOT_FOUND";
        throw e;
    }
    if (session.mode !== "work") {
        const e = new Error("Not a Sarah Work session");
        e.status = 422;
        e.code = "NOT_WORK_SESSION";
        throw e;
    }
    if (session.workCompletedAt) {
        const e = new Error("This task has already completed");
        e.status = 409;
        e.code = "WORK_ALREADY_COMPLETED";
        throw e;
    }
    if (session.workQuotaReleasedAt || session.workCancelledAt) {
        return {
            session: serializePersonalSarahSessionDetail(session),
            quota: await getConsumerWorkTaskUsage(uid),
            alreadyCancelled: true,
        };
    }
    if (!session.workSubmittedAt) {
        return {
            session: serializePersonalSarahSessionDetail(session),
            quota: await getConsumerWorkTaskUsage(uid),
            alreadyCancelled: false,
            noop: true,
        };
    }
    const quota = await releaseConsumerWorkTask(uid, { dayKey: session.workQuotaDayKey || undefined });
    const now = new Date().toISOString();
    session.workCancelledAt = now;
    session.workQuotaReleasedAt = now;
    session.workSubmittedAt = null;
    session.workQuotaDayKey = null;
    appendWorkActivity(session, { kind: "cancel", label: "You cancelled this assignment" });
    syncWorkWorkspace(session);
    await persistPersonalSarahSession(session);
    auditLog("personal_sarah_work_cancel", { uid, sessionId: id });
    return {
        session: serializePersonalSarahSessionDetail(session),
        quota: { usage: quota.usage, limit: quota.limit, dayKey: quota.dayKey, remaining: quota.remaining },
        released: quota.released,
    };
}

export async function handleListPersonalSarahWorkDeliverables(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        res.json({
            sessionId: session.id,
            deliverables: buildWorkDeliverables(session),
            files: buildWorkReferenceFiles(session),
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Deliverables unavailable", code: "WORK_DELIVERABLES_ERROR" });
    }
}

export async function handleGetPersonalSarahWorkDeliverable(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const deliverableId = String(req.params?.deliverableId || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        if (deliverableId === "del-primary" && hasPendingLevel2Approval(session)) {
            return res.status(403).json({
                error: "Approve the outbound action before downloading the final deliverable.",
                code: "WORK_APPROVAL_REQUIRED",
            });
        }
        const body = resolveWorkDeliverableBody(session, deliverableId);
        if (!body) {
            return res.status(404).json({ error: "Deliverable not ready", code: "DELIVERABLE_NOT_READY" });
        }
        const meta = buildWorkDeliverables(session).find((d) => d.id === deliverableId) || { id: deliverableId };
        res.json({
            sessionId: session.id,
            deliverable: { ...meta, ...body },
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Deliverable unavailable", code: "WORK_DELIVERABLE_ERROR" });
    }
}

export async function handlePersonalSarahWorkHome(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const dashboard = await buildPersonalSarahWorkHome(uid);
        res.json({ dashboard });
    } catch (err) {
        res.status(500).json({ error: err.message || "Work home unavailable", code: "WORK_HOME_ERROR" });
    }
}

export function handlePersonalSarahWorkCapabilities(req, res) {
    res.json({ capabilities: listWorkCapabilityCatalog() });
}

export async function handleGetPersonalSarahWorkSettings(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        if (session.mode !== "work") return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        syncWorkWorkspace(session);
        res.json({
            sessionId: session.id,
            settings: session.workWorkspace?.settings || mergeWorkAssignmentSettings(session),
            trust: session.workWorkspace?.trust || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Work settings unavailable", code: "WORK_SETTINGS_ERROR" });
    }
}

export async function handlePatchPersonalSarahWorkSettings(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        if (session.mode !== "work") return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        if (!session.workWorkspace) session.workWorkspace = {};
        session.workWorkspace.settings = mergeWorkAssignmentSettings(session, body.settings || body);
        syncWorkWorkspace(session);
        await persistPersonalSarahSession(session);
        res.json({
            session: serializePersonalSarahSessionDetail(session),
            settings: session.workWorkspace.settings,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Work settings update failed", code: "WORK_SETTINGS_ERROR" });
    }
}

export async function handleGetPersonalSarahWorkUsageRollup(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const rollup = await aggregateSarahWorkForUser(uid);
        res.json({ rollup });
    } catch (err) {
        res.status(500).json({ error: err.message || "Work rollup unavailable", code: "WORK_ROLLUP_ERROR" });
    }
}

export async function handleListPersonalSarahWorkApprovals(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        res.json({ sessionId, approvals: listWorkApprovals(session) });
    } catch (err) {
        res.status(500).json({ error: err.message || "Approvals unavailable", code: "WORK_APPROVALS_ERROR" });
    }
}

export async function handleResolvePersonalSarahWorkApproval(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const approvalId = String(req.params?.approvalId || "").trim();
        const decision = String(req.body?.decision || "").toLowerCase();
        if (!["approved", "rejected"].includes(decision)) {
            return res.status(422).json({ error: "decision must be approved or rejected", code: "DECISION_INVALID" });
        }
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        const result = resolveWorkApproval(session, approvalId, { decision, note: req.body?.note });
        if (!result.ok) {
            const status = result.code === "APPROVAL_NOT_FOUND" ? 404 : 409;
            return res.status(status).json({ error: "Could not resolve approval", code: result.code });
        }
        const wasL3Pause =
            session.workPausedAt &&
            session.workPauseReason?.includes("Level 3") &&
            decision === "approved" &&
            !hasBlockingLevel3Approval(session);
        if (wasL3Pause) {
            session.workPausedAt = null;
            session.workPauseReason = null;
            session.status = "running";
        }
        await persistPersonalSarahSession(session);
        if (wasL3Pause) {
            void executePersonalSarahWorkRun(session).catch((err) =>
                console.warn("[personalSarahWorkRunner] resume after L3", sessionId, err?.message || err)
            );
        }
        auditLog("personal_sarah_work_approval", { uid, sessionId, approvalId, decision });
        res.json({
            session: serializePersonalSarahSessionDetail(session),
            approval: result.approval,
            resumed: Boolean(wasL3Pause),
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Approval resolve failed", code: "WORK_APPROVAL_RESOLVE_ERROR" });
    }
}

export async function handleGetPersonalSarahWorkReport(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        if (!session.workReport) {
            return res.status(404).json({ error: "Report not ready yet", code: "WORK_REPORT_PENDING" });
        }
        res.json({
            sessionId: session.id,
            report: session.workReport,
            workCompletedAt: session.workCompletedAt || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Report unavailable", code: "WORK_REPORT_ERROR" });
    }
}

export async function handleCancelPersonalSarahWork(req, res) {
    try {
        const data = await cancelPersonalSarahWorkSession(req.consumerAuth.uid, req.params?.id);
        res.json(data);
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ error: err.message || "Work cancel failed", code: err.code || "WORK_CANCEL_ERROR" });
    }
}

export async function handleCreatePersonalSarahReminder(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const task = await createPersonalReminderFromApi(uid, req.body || {});
        try {
            const { createSarahReminderScheduledNotification } = await import("../network/notificationService.js");
            await createSarahReminderScheduledNotification(uid, {
                reminderId: task.id,
                title: task.title,
                body: task.notes || task.title,
                dueAt: task.dueAt,
            });
        } catch (err) {
            console.warn("[api/personal-sarah/reminders]", err?.message || err);
        }
        res.status(201).json({ reminder: task });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ error: err.message || "Could not create reminder", code: err.code || "REMINDER_ERROR" });
    }
}

export async function handleListPersonalSarahReminders(req, res) {
    try {
        const reminders = await listPersonalReminders(req.consumerAuth.uid, { limit: req.query.limit });
        res.json({ reminders });
    } catch (err) {
        res.status(500).json({ error: err.message || "Could not list reminders", code: "REMINDER_LIST_ERROR" });
    }
}

export async function handleDuePersonalSarahReminders(req, res) {
    try {
        const result = await deliverDuePersonalReminders(req.consumerAuth.uid);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || "Reminder delivery failed", code: "REMINDER_DUE_ERROR" });
    }
}

export async function handleGeofencePersonalSarahReminders(req, res) {
    try {
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(422).json({ error: "lat and lng required", code: "GEO_INVALID" });
        }
        const result = await deliverGeofenceReminders(req.consumerAuth.uid, { lat, lng });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || "Geo reminder check failed", code: "REMINDER_GEO_ERROR" });
    }
}

export async function handlePersonalSarahWorkEstimate(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const sessionId = String(req.params?.id || "").trim();
        if (!sessionId) {
            return res.status(400).json({ error: "Session id required", code: "SESSION_ID_REQUIRED" });
        }
        const session = await getPersonalSarahSessionForUser(uid, sessionId);
        if (!session) {
            return res.status(404).json({ error: "Conversation not found", code: "SESSION_NOT_FOUND" });
        }
        if (session.mode !== "work") {
            return res.status(422).json({ error: "Not a Sarah Work session", code: "NOT_WORK_SESSION" });
        }
        const plan = await allocateWorkBudgetForSession(uid, session);
        res.json({ workBudget: plan });
    } catch (err) {
        res.status(500).json({ error: err.message || "Estimate failed", code: "WORK_ESTIMATE_ERROR" });
    }
}

export async function handlePersonalSarahQuota(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const entitlements = await getConsumerEntitlements(uid);
        const work = await getConsumerWorkTaskUsage(uid);
        const creditsShadow = await getConsumerSarahCreditShadowSummary(uid);
        res.json({
            chatLimit: Number(entitlements?.sarahLimits?.dailyChats ?? 0),
            workTasksPerDay: work.limit,
            workTasksUsed: work.usage,
            workTasksRemaining: work.remaining,
            dayKey: work.dayKey,
            periodScoped: Boolean(work.periodScoped),
            periodEnd: work.periodEnd || null,
            creditsShadow,
            monthlyAllowanceCredits: creditsShadow.monthlyAllowanceCredits,
            monthlyUsedCredits: creditsShadow.monthlyUsedCredits,
            monthlyRemainingCredits: creditsShadow.monthlyRemainingCredits,
            topUpBalanceCredits: creditsShadow.topUpBalanceCredits,
            usagePercent: creditsShadow.usagePercent,
            meteringMode: creditsShadow.meteringMode,
            enforcementMode: creditsShadow.enforcementMode,
            periodKey: creditsShadow.periodKey,
            periodStart: creditsShadow.periodStart,
            periodEnd: creditsShadow.periodEnd,
            renewalDate: creditsShadow.renewalDate,
            recentUsage: creditsShadow.recentUsage,
            dailyCreditSoftCap: creditsShadow.dailyCreditSoftCap,
            usageAlert: creditsShadow.usageAlert,
            creditsBlocked: creditsShadow.creditsBlocked,
            availableCredits: creditsShadow.availableCredits,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Quota unavailable", code: "QUOTA_ERROR" });
    }
}

function usageEventsToCsv(exportPayload) {
    const header = [
        "at",
        "credits",
        "archetype",
        "surface",
        "interaction",
        "sessionId",
        "messagePreview",
        "debitSource",
    ];
    const lines = [header.join(",")];
    for (const ev of exportPayload.events || []) {
        lines.push(
            header
                .map((k) => {
                    const v = String(ev[k] ?? "");
                    return v.includes(",") || v.includes('"') || v.includes("\n")
                        ? `"${v.replace(/"/g, '""')}"`
                        : v;
                })
                .join(",")
        );
    }
    return `${lines.join("\n")}\n`;
}

export async function handlePersonalSarahUsageExport(req, res) {
    try {
        const uid = req.consumerAuth.uid;
        const payload = await getConsumerSarahCreditUsageExport(uid);
        const format = String(req.query.format || "json").toLowerCase();
        if (format === "csv") {
            const stamp = (payload.periodKey || "period").replace(/[^\w-]/g, "_");
            res.setHeader("content-type", "text/csv; charset=utf-8");
            res.setHeader("content-disposition", `attachment; filename="sarah-usage-${stamp}.csv"`);
            return res.send(usageEventsToCsv(payload));
        }
        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message || "Usage export failed", code: "USAGE_EXPORT_ERROR" });
    }
}

export function mountPersonalSarahRoutes(app) {
    app.post("/api/personal-sarah/chat", personalSarahRateLimit, requireConsumerScope(), handlePersonalSarahChatRequest);

    app.get("/api/personal-sarah/quota", requireConsumerScope(), handlePersonalSarahQuota);

    app.get("/api/personal-sarah/usage/export", requireConsumerScope(), handlePersonalSarahUsageExport);

    app.post("/api/personal-sarah/reminders", requireConsumerScope(), handleCreatePersonalSarahReminder);
    app.get("/api/personal-sarah/reminders", requireConsumerScope(), handleListPersonalSarahReminders);
    app.get("/api/personal-sarah/reminders/due", requireConsumerScope(), handleDuePersonalSarahReminders);

    app.post("/api/personal-sarah/reminders/geo-check", requireConsumerScope(), handleGeofencePersonalSarahReminders);

    app.get("/api/personal-sarah/sessions", requireConsumerScope(), handleListPersonalSarahSessions);

    app.post("/api/personal-sarah/sessions", requireConsumerScope(), handleCreatePersonalSarahSession);

    app.get("/api/personal-sarah/work/home", requireConsumerScope(), handlePersonalSarahWorkHome);

    app.get("/api/personal-sarah/work/capabilities", requireConsumerScope(), handlePersonalSarahWorkCapabilities);

    app.get("/api/personal-sarah/work/usage-rollup", requireConsumerScope(), handleGetPersonalSarahWorkUsageRollup);

    app.get("/api/personal-sarah/sessions/:id/work/settings", requireConsumerScope(), handleGetPersonalSarahWorkSettings);

    app.patch("/api/personal-sarah/sessions/:id/work/settings", requireConsumerScope(), handlePatchPersonalSarahWorkSettings);

    app.get("/api/personal-sarah/sessions/:id/work/estimate", requireConsumerScope(), handlePersonalSarahWorkEstimate);

    app.post("/api/personal-sarah/sessions/:id/work/submit", requireConsumerScope(), handleSubmitPersonalSarahWork);

    app.post("/api/personal-sarah/sessions/:id/work/cancel", requireConsumerScope(), handleCancelPersonalSarahWork);

    app.get("/api/personal-sarah/sessions/:id/work/report", requireConsumerScope(), handleGetPersonalSarahWorkReport);

    app.get("/api/personal-sarah/sessions/:id/work/deliverables", requireConsumerScope(), handleListPersonalSarahWorkDeliverables);

    app.get(
        "/api/personal-sarah/sessions/:id/work/deliverables/:deliverableId",
        requireConsumerScope(),
        handleGetPersonalSarahWorkDeliverable
    );

    app.get("/api/personal-sarah/sessions/:id/work/approvals", requireConsumerScope(), handleListPersonalSarahWorkApprovals);

    app.post(
        "/api/personal-sarah/sessions/:id/work/approvals/:approvalId/resolve",
        requireConsumerScope(),
        handleResolvePersonalSarahWorkApproval
    );

    app.get("/api/personal-sarah/sessions/active", requireConsumerScope(), handleGetActivePersonalSarahSession);

    app.get("/api/personal-sarah/sessions/:id", requireConsumerScope(), handleGetPersonalSarahSession);

    app.get("/api/personal-sarah/news/profile", requireConsumerScope(), async (req, res) => {
        try {
            const profile = await getSarahNewsProfile(req.consumerAuth.uid);
            res.json({ ok: true, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                ok: false,
                error: { code: err.code || "NEWS_PROFILE_READ_FAILED", message: err.message },
            });
        }
    });

    app.put("/api/personal-sarah/news/profile", requireConsumerScope(), async (req, res) => {
        try {
            const profile = await setSarahNewsProfile(req.consumerAuth.uid, req.body || {});
            res.json({ ok: true, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                ok: false,
                error: { code: err.code || "NEWS_PROFILE_SAVE_FAILED", message: err.message },
            });
        }
    });

    app.get("/api/personal-sarah/news/editions/latest", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            let profile = await getSarahNewsProfile(uid);
            if (!profile?.regions?.length) {
                res.status(404).json({
                    ok: false,
                    error: { code: "NEWS_PROFILE_MISSING", message: "Complete Sarah News setup first." },
                });
                return;
            }
            const slot = String(req.query.slot || "").trim() || undefined;
            const refresh = String(req.query.refresh || "") === "1";
            const edition = await compileSarahNewsEdition(profile, {
                slot,
                uid,
                persistEdition: true,
                refresh,
            });
            res.json({ ok: true, edition, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                ok: false,
                error: { code: err.code || "NEWS_EDITION_FAILED", message: err.message },
            });
        }
    });

    app.get("/api/personal-sarah/news/deliver/poll", requireConsumerScope(), async (req, res) => {
        try {
            const result = await pollSarahNewsDeliveryForUser(req.consumerAuth.uid);
            if (!result.ok) {
                res.status(404).json({
                    ok: false,
                    error: { code: result.code || "NEWS_DELIVER_FAILED", message: "Sarah News is not set up." },
                });
                return;
            }
            res.json({ ok: true, ...result });
        } catch (err) {
            res.status(err.status || 500).json({
                ok: false,
                error: { code: err.code || "NEWS_DELIVER_FAILED", message: err.message },
            });
        }
    });

    app.get("/api/personal-sarah/news/stories/:storyId", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const storyId = String(req.params.storyId || "").trim();
            const slot = String(req.query.slot || "").trim() || undefined;
            const result = await getSarahNewsStoryForUser(uid, storyId, { slot });
            if (!result.success) {
                const status = result.code === "STORY_NOT_FOUND" ? 404 : result.code === "NEWS_PROFILE_MISSING" ? 404 : 400;
                res.status(status).json({
                    ok: false,
                    error: { code: result.code || "STORY_READ_FAILED", message: result.error },
                });
                return;
            }
            res.json({ ok: true, story: result.story, edition: result.edition });
        } catch (err) {
            res.status(err.status || 500).json({
                ok: false,
                error: { code: err.code || "STORY_READ_FAILED", message: err.message },
            });
        }
    });

    app.get("/api/personal-sarah/home/cards", requireConsumerScope(), async (req, res) => {
        try {
            const mode = String(req.query.mode || "chat").toLowerCase() === "work" ? "work" : "chat";
            const dismissed = String(req.query.dismissed || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const pinned = String(req.query.pinned || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const staticHome = ["1", "true"].includes(String(req.query.static || "").toLowerCase());
            const data = await getSarahHomeCards(req.consumerAuth.uid, {
                mode,
                dismissedCardIds: dismissed,
                pinnedCardIds: pinned,
                staticHome,
            });
            res.json({ ok: true, ...data });
        } catch (err) {
            res.status(500).json({ error: err.message || "Home cards unavailable", code: "SHI_HOME_FAILED" });
        }
    });
}
