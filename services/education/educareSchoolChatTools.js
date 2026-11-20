/**
 * Sarah App — Educare school reception tools (registration + parent support).
 */
import { EDUCARE_SARAH_SYSTEM_PROMPT } from "../storage/educareSchoolKnowledge.js";
import {
    listGuardianLinksForParent,
    GUARDIAN_STATUS,
} from "./schoolGuardianService.js";
import { listAdmissionsForParent } from "./schoolAdmissionService.js";
import { logParentConcern } from "./schoolParentConcernService.js";

export const EDUCARE_SARAH_APP_TOOL_NAMES = Object.freeze([
    "getParentEducareStatus",
    "openEducareAdmissionForm",
    "logParentConcern",
]);

export async function getParentEducareStatusSummary(companyId, parentUid) {
    const links = parentUid ? await listGuardianLinksForParent(companyId, parentUid).catch(() => []) : [];
    const admissions = parentUid ? await listAdmissionsForParent(companyId, parentUid).catch(() => []) : [];
    const approved = links.filter((l) => l.status === GUARDIAN_STATUS.APPROVED);
    const pending = links.filter((l) => l.status === GUARDIAN_STATUS.PENDING);

    return {
        mode: approved.length ? "verified_guardian" : "prospect",
        approvedGuardianLinks: approved.length,
        pendingGuardianLinks: pending.length,
        learners: approved.map((l) => ({
            name: l.learner?.name,
            grade: l.learner?.grade,
            campusId: l.campusId,
        })),
        admissionApplications: admissions.map((a) => ({
            reference: a.reference,
            status: a.status,
            gradeApplyingFor: a.gradeApplyingFor,
            campusId: a.campusId,
        })),
    };
}

const getParentEducareStatusTool = {
    name: "getParentEducareStatus",
    description:
        "Check whether this parent is a verified guardian at the school or a new prospect, and list their admission applications.",
    parameters: { type: "object", properties: {} },
    async execute(ctx) {
        const summary = await getParentEducareStatusSummary(ctx.companyId, ctx.customerId);
        const message =
            summary.mode === "verified_guardian"
                ? `Verified guardian (${summary.approvedGuardianLinks} learner link(s)). ${summary.pendingGuardianLinks ? `${summary.pendingGuardianLinks} link(s) still pending verification.` : ""}`
                : summary.admissionApplications.length
                  ? `Prospect parent with ${summary.admissionApplications.length} admission application(s) on file.`
                  : "Prospect parent — not yet a verified guardian. Registration-first conversation.";
        return { ok: true, success: true, message, data: summary, ...summary };
    },
};

const openEducareAdmissionFormTool = {
    name: "openEducareAdmissionForm",
    description:
        "Open the Educare admission registration form in the Sarah App for the parent to complete. Use for new enrolments when they are ready to apply.",
    parameters: {
        type: "object",
        properties: {
            gradeHint: { type: "string", description: "Optional grade they mentioned (e.g. Grade 5 or RR)" },
            campusId: { type: "string", enum: ["primary", "secondary"], description: "Campus hint if known" },
        },
    },
    async execute(ctx, args = {}) {
        return {
            ok: true,
            success: true,
            message: "The admission form is opening in Sarah App — they can complete and submit enrolment there.",
            uiHints: [
                {
                    action: "openEducareAdmissionForm",
                    companyId: ctx.companyId,
                    prefill: {
                        gradeApplyingFor: args.gradeHint || null,
                        campusId: args.campusId || null,
                    },
                },
            ],
        };
    },
};

const logParentConcernTool = {
    name: "logParentConcern",
    description:
        "Log an escalated parent concern for school staff after collecting child name, grade, issue, and optional extra details. Use for verified guardians reporting problems.",
    parameters: {
        type: "object",
        properties: {
            childName: { type: "string" },
            childGrade: { type: "string" },
            category: {
                type: "string",
                description: "e.g. academic, behaviour, transport, fees, safety, general",
            },
            issue: { type: "string", description: "Main concern description" },
            additional: { type: "string", description: "Optional extra context" },
        },
        required: ["childName", "issue"],
    },
    async execute(ctx, args = {}) {
        const result = await logParentConcern(ctx.companyId, ctx.customerId, {
            ...args,
            channel: ctx.channel || "sarah_app",
        });
        return { ...result, uiHints: [] };
    },
};

export const EDUCARE_SCHOOL_CHAT_TOOLS = [
    getParentEducareStatusTool,
    openEducareAdmissionFormTool,
    logParentConcernTool,
];

export function getEducareOpenAIToolDefinitions(toolNames = EDUCARE_SARAH_APP_TOOL_NAMES) {
    const allowed = new Set(toolNames);
    return EDUCARE_SCHOOL_CHAT_TOOLS.filter((t) => allowed.has(t.name)).map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}

/**
 * @param {object[]} toolResults
 */
export function extractEducareUiHints(toolResults = []) {
    const hints = [];
    for (const row of toolResults) {
        const bag = row?.uiHints || row?.result?.uiHints;
        if (Array.isArray(bag)) hints.push(...bag);
    }
    return hints;
}

export function buildEducareCompanySarahGreeting(preferredName, companyName) {
    const name = preferredName || "there";
    return (
        `Hello ${name}! 👋 I'm Sarah from ${companyName}.\n\n` +
        `I can help with **admissions & registration** for new families, or **parent support** if you already have a child at the school.\n\n` +
        `Tell me what you need — or say **Register Now** to start an admission application.`
    );
}

export { EDUCARE_SARAH_SYSTEM_PROMPT };