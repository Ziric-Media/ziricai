/**
 * Automotive Operations — deterministic status-reply disclosure after listTasks (reply assembly).
 */
import { moduleKeyFromPortalSurface, PORTAL_SARAH_SURFACES } from "./portalSarahSurfaces.js";

/** @type {RegExp} */
const TASK_LIST_SCOPE_RE =
    /task list|task data|operations task list|recorded in.*task|available task data|based on.*task/i;

/** @type {RegExp} */
const BROAD_REASSURANCE_RE =
    /need your attention at this time|nothing needs (your )?attention|no operational issues overall|dealership has no issues|everything is fine at central motors/i;

const STATUS_QUESTION_EXCLUDE_RE =
    /\b(how do i|how to|what is a task|help me create|walk me through creating)\b/i;

const STATUS_QUESTION_SIGNAL_RE =
    /\b(overdue|open tasks?|still open|outstanding tasks?|what needs attention|needs attention|attention next|current position|summar(?:y|ise|ize)|what'?s pending|pending tasks?)\b/i;

const STATUS_TASK_CONTEXT_RE = /\b(tasks?|operations|to-?do|work items?)\b/i;

export const AUTOMOTIVE_OPS_LIMITATION_PARAGRAPH =
    "Important limitation: I checked the Operations task list only. I haven't verified live vehicle inventory, the appointment calendar or the Automotive Command Centre metrics in this conversation, so I can't confirm their current status.";

export const AUTOMOTIVE_OPS_OPTIONAL_DEALERSHIP_GUIDANCE =
    "For the dealership, consider recording vehicle preparation, test-drive coordination and delivery milestones as Operations tasks when that work applies — without assuming anything is already pending.";

/**
 * @param {string} message
 */
export function isAutomotiveOpsBroadStatusQuestion(message) {
    const text = String(message || "").trim();
    if (!text) return false;
    if (STATUS_QUESTION_EXCLUDE_RE.test(text)) return false;
    if (!STATUS_QUESTION_SIGNAL_RE.test(text)) return false;
    return STATUS_TASK_CONTEXT_RE.test(text) || /\bcentral motors\b/i.test(text);
}

/**
 * @param {{ industryPreset?: object, surface?: string, pageContext?: object }} ctx
 */
export function isAutomotiveOpsContext(ctx) {
    if (!ctx?.industryPreset?.active || ctx.industryPreset.industry !== "automotive") {
        return false;
    }
    const moduleKey = ctx.pageContext?.module || moduleKeyFromPortalSurface(ctx.surface);
    const onOps =
        moduleKey === "operations" ||
        String(ctx.surface || "").toLowerCase() === PORTAL_SARAH_SURFACES.OPERATIONS;
    return onOps;
}

/**
 * @param {Array<{ tool?: string, success?: boolean, data?: object }>} actions
 */
export function getListTasksOutcome(actions) {
    const list = Array.isArray(actions) ? actions : [];
    /** @type {object|null} */
    let lastSuccess = null;
    for (const action of list) {
        if (action?.tool === "listTasks" && action.success === true) {
            lastSuccess = action;
        }
    }
    if (!lastSuccess) {
        return {
            called: false,
            success: false,
            count: null,
            overdueCount: null,
            evidenceReliable: false,
        };
    }

    const data = lastSuccess.data || {};
    let count = null;
    if (typeof data.count === "number" && Number.isFinite(data.count)) {
        count = data.count;
    } else if (Array.isArray(data.tasks)) {
        count = data.tasks.length;
    }

    let overdueCount = null;
    if (typeof data.overdueCount === "number" && Number.isFinite(data.overdueCount)) {
        overdueCount = data.overdueCount;
    }

    const evidenceReliable = count !== null;

    return {
        called: true,
        success: true,
        count,
        overdueCount: overdueCount ?? (evidenceReliable ? 0 : null),
        evidenceReliable,
    };
}

/**
 * @param {string} reply
 */
export function replyHasCapabilityDisclosure(reply) {
    const lower = String(reply || "").toLowerCase();
    return (
        /inventory|appointment|calendar|command centre/i.test(lower) &&
        /task list only|only the task|only.*task list|haven't verified|have not verified|not verified|did not check|can't confirm|cannot confirm|this conversation|this chat/i.test(
            lower
        )
    );
}

/**
 * @param {string} reply
 */
function replyHasOptionalDealershipGuidance(reply) {
    const lower = String(reply || "").toLowerCase();
    return /vehicle preparation|test-drive|delivery milestone/i.test(lower);
}

/**
 * @param {string} reply
 * @param {{ count?: number, overdueCount?: number, statusQuestion?: boolean }} listTasksData
 */
export function automotiveOpsReplySemanticsChecklist(reply, listTasksData = {}) {
    const text = String(reply || "");
    const lower = text.toLowerCase();
    const count = Number(listTasksData.count ?? 0);
    const overdueCount = Number(listTasksData.overdueCount ?? 0);
    const statusQuestion = listTasksData.statusQuestion !== false;

    return {
        statesZeroTasksWhenEmpty:
            count === 0
                ? /no overdue|zero|none|0 overdue|no matching|no recorded|no open|no tasks/i.test(text)
                : true,
        scopedToTaskEvidence:
            count === 0 && statusQuestion ? TASK_LIST_SCOPE_RE.test(lower) : true,
        avoidsUnscopedAllClear:
            count === 0 && statusQuestion
                ? !(BROAD_REASSURANCE_RE.test(lower) && !TASK_LIST_SCOPE_RE.test(lower))
                : true,
        dealershipAware: /dealership|vehicle preparation|test-drive|delivery milestone|central motors/i.test(text),
        capabilityDisclosureWhenStatusAsked:
            count === 0 && statusQuestion
                ? replyHasCapabilityDisclosure(reply)
                : statusQuestion
                  ? replyHasCapabilityDisclosure(reply)
                  : true,
        noFalseToolClaims:
            !/\b(checked|verified|reviewed|confirmed)\b.*\b(inventory|appointment calendar|command centre)\b/i.test(
                lower
            ) || /not verified|haven't|have not|can't|cannot|didn't|did not/i.test(lower),
        groundedInToolCounts:
            overdueCount === 0 ? !/\b(several|many|multiple) overdue\b/i.test(lower) : true,
        noCrmWonAsDelivery: !/crm.*won.*delivered/i.test(lower),
        noFabricatedPendingWork:
            !/\b(pending prep|awaiting delivery|test drive scheduled|vehicle is ready)\b/i.test(lower),
    };
}

/**
 * uiHints for Operations task tools — omit redundant navigate when already on Operations Sarah surface.
 * @param {{ surface?: string }} ctx
 * @returns {Array<{ navigate?: string }>}
 */
export function operationsTaskToolUiHints(ctx) {
    if (String(ctx?.surface || "").toLowerCase() === PORTAL_SARAH_SURFACES.OPERATIONS) {
        return [];
    }
    return [{ navigate: "operations" }];
}

/**
 * @param {{
 *   reply: string,
 *   ctx: object,
 *   message: string,
 *   actions?: object[],
 * }} input
 */
export function enhanceAutomotiveOpsStatusReply(input) {
    let reply = String(input.reply || "").trim();
    const meta = {
        limitationAppended: false,
        guidanceAppended: false,
        modified: false,
    };

    if (!isAutomotiveOpsContext(input.ctx)) {
        return { reply, ...meta };
    }
    if (!isAutomotiveOpsBroadStatusQuestion(input.message)) {
        return { reply, ...meta };
    }

    const outcome = getListTasksOutcome(input.actions);
    if (!outcome.called || !outcome.success || !outcome.evidenceReliable) {
        return { reply, ...meta };
    }

    const listTasksData = {
        count: outcome.count,
        overdueCount: outcome.overdueCount ?? 0,
        statusQuestion: true,
    };

    if (!replyHasCapabilityDisclosure(reply)) {
        reply = reply ? `${reply}\n\n${AUTOMOTIVE_OPS_LIMITATION_PARAGRAPH}` : AUTOMOTIVE_OPS_LIMITATION_PARAGRAPH;
        meta.limitationAppended = true;
        meta.modified = true;
    }

    if (
        outcome.count === 0 &&
        !replyHasOptionalDealershipGuidance(reply)
    ) {
        reply = `${reply}\n\n${AUTOMOTIVE_OPS_OPTIONAL_DEALERSHIP_GUIDANCE}`;
        meta.guidanceAppended = true;
        meta.modified = true;
    }

    return { reply, ...meta };
}
