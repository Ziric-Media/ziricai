/**
 * Sarah App — Educare school reception tools (registration + parent support).
 */
import { EDUCARE_SARAH_SYSTEM_PROMPT } from "../storage/educareSchoolKnowledge.js";
import {
    listGuardianLinksForParent,
    GUARDIAN_STATUS,
} from "./schoolGuardianService.js";
import {
    createAdmissionDraft,
    listAdmissionsForParent,
    registerAdmissionDocument,
    submitAdmissionApplication,
    updateAdmissionDraft,
} from "./schoolAdmissionService.js";
import { logParentConcern } from "./schoolParentConcernService.js";

export const EDUCARE_SARAH_APP_TOOL_NAMES = Object.freeze([
    "getParentEducareStatus",
    "saveEducareAdmissionFromChat",
    "submitEducareAdmissionFromChat",
    "registerEducareAdmissionDocument",
    "logParentConcern",
]);

function splitChildName(fullName = "") {
    const parts = String(fullName || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return { legalFirstName: "", legalSurname: "" };
    if (parts.length === 1) return { legalFirstName: parts[0], legalSurname: parts[0] };
    return { legalFirstName: parts[0], legalSurname: parts.slice(1).join(" ") };
}

function approxDobFromAge(ageYears) {
    const age = Number(ageYears);
    if (!Number.isFinite(age) || age < 1 || age > 25) return null;
    const year = new Date().getFullYear() - Math.floor(age);
    return `${year}-07-01`;
}

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

const saveEducareAdmissionFromChatTool = {
    name: "saveEducareAdmissionFromChat",
    description:
        "Create or update a new enquiry / admission application in the school portal from the chat. Ask conversationally for child name, age or date of birth, gender, grade applying for, campus, and parent contact. Call repeatedly as you learn more.",
    parameters: {
        type: "object",
        properties: {
            applicationId: { type: "string", description: "Existing draft id from a prior save in this chat" },
            childFullName: { type: "string", description: "Learner full name" },
            childAgeYears: { type: "number", description: "Age in years if DOB unknown yet" },
            dateOfBirth: { type: "string", description: "YYYY-MM-DD when known" },
            gender: { type: "string", description: "Child gender if parent shared it" },
            gradeApplyingFor: { type: "string", description: "e.g. RR, 1, 8, Matric" },
            campusId: { type: "string", enum: ["primary", "secondary", "preschool"], description: "Campus" },
            academicYear: { type: "string", description: "Year applying for, e.g. 2026" },
            parentFullName: { type: "string" },
            parentMobile: { type: "string" },
            parentEmail: { type: "string" },
            parentRelationship: { type: "string" },
            notes: { type: "string", description: "Extra context from chat" },
        },
    },
    async execute(ctx, args = {}) {
        const parentUid = ctx.customerId;
        if (!parentUid) {
            return { ok: false, success: false, message: "Parent must be signed in to save an enquiry." };
        }
        const nameParts = splitChildName(args.childFullName);
        const dob = String(args.dateOfBirth || "").trim() || approxDobFromAge(args.childAgeYears) || "";
        const learnerPatch = {
            ...(nameParts.legalFirstName ? { legalFirstName: nameParts.legalFirstName } : {}),
            ...(nameParts.legalSurname ? { legalSurname: nameParts.legalSurname } : {}),
            ...(dob ? { dateOfBirth: dob } : {}),
            ...(args.gender ? { gender: args.gender } : {}),
            ...(args.notes ? { previousSchool: String(args.notes).slice(0, 200) } : {}),
        };
        const guardianPatch = {
            ...(args.parentFullName ? { fullName: args.parentFullName } : { fullName: ctx.customerName }),
            ...(args.parentMobile || ctx.customerPhone ? { mobile: args.parentMobile || ctx.customerPhone } : {}),
            ...(args.parentEmail ? { email: args.parentEmail } : {}),
            ...(args.parentRelationship ? { relationship: args.parentRelationship } : {}),
        };
        let applicationId = String(args.applicationId || "").trim();
        let summary;
        try {
            if (!applicationId) {
                const created = await createAdmissionDraft(ctx.companyId, parentUid, {
                    academicYear: args.academicYear || String(new Date().getFullYear() + 1),
                    gradeApplyingFor: args.gradeApplyingFor || "",
                    campusId: args.campusId || "",
                    learner: learnerPatch,
                    guardian: guardianPatch,
                });
                applicationId = created.applicationId;
                summary = created;
            } else {
                summary = await updateAdmissionDraft(ctx.companyId, parentUid, applicationId, {
                    academicYear: args.academicYear,
                    gradeApplyingFor: args.gradeApplyingFor,
                    campusId: args.campusId,
                    learner: learnerPatch,
                    guardian: guardianPatch,
                });
            }
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Could not save enquiry." };
        }
        return {
            ok: true,
            success: true,
            message: `Saved enquiry ${summary.reference || applicationId} on the school portal (draft).`,
            data: { applicationId, reference: summary.reference, status: summary.status },
        };
    },
};

const submitEducareAdmissionFromChatTool = {
    name: "submitEducareAdmissionFromChat",
    description:
        "Submit the saved admission enquiry after the parent confirms details and agrees to the privacy notice in chat. Appears under New enquiries for school staff.",
    parameters: {
        type: "object",
        properties: {
            applicationId: { type: "string" },
            parentConfirmedConsent: {
                type: "boolean",
                description: "True only after parent clearly agrees to submit and privacy processing",
            },
        },
        required: ["applicationId", "parentConfirmedConsent"],
    },
    async execute(ctx, args = {}) {
        if (args.parentConfirmedConsent !== true) {
            return { ok: false, success: false, message: "Parent must confirm consent in chat before submit." };
        }
        try {
            const submitted = await submitAdmissionApplication(ctx.companyId, ctx.customerId, args.applicationId, {
                consent: true,
            });
            return {
                ok: true,
                success: true,
                message: `Enquiry submitted as ${submitted.reference}. School staff will review in the portal.`,
                data: submitted,
            };
        } catch (err) {
            return {
                ok: false,
                success: false,
                message: err.message || "Submit failed — save missing fields with saveEducareAdmissionFromChat first.",
            };
        }
    },
};

const registerEducareAdmissionDocumentTool = {
    name: "registerEducareAdmissionDocument",
    description:
        "Register a document or image the parent attached in chat against their admission enquiry (birth certificate, ID copy, etc.).",
    parameters: {
        type: "object",
        properties: {
            applicationId: { type: "string" },
            documentType: {
                type: "string",
                description: "Checklist type e.g. birth_certificate, parent_id, report_card",
            },
            fileName: { type: "string" },
            uploadId: { type: "string", description: "From chat attachment uploadId when available" },
        },
        required: ["applicationId", "documentType", "fileName"],
    },
    async execute(ctx, args = {}) {
        try {
            const storageRef = args.uploadId ? `chat-media:${args.uploadId}` : null;
            const updated = await registerAdmissionDocument(ctx.companyId, ctx.customerId, args.applicationId, {
                type: args.documentType,
                fileName: args.fileName,
                storageRef,
            });
            return {
                ok: true,
                success: true,
                message: `Registered ${args.fileName} on ${updated.reference || args.applicationId}.`,
                data: updated,
            };
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Could not register document." };
        }
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
    saveEducareAdmissionFromChatTool,
    submitEducareAdmissionFromChatTool,
    registerEducareAdmissionDocumentTool,
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
        `I handle **new enrolment enquiries**, **questions about the school**, and **parent support** if your child is already with us — all here in chat.\n\n` +
        `What would you like help with today?`
    );
}

export { EDUCARE_SARAH_SYSTEM_PROMPT };