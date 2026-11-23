/**
 * Company Sarah — Sach Accounting client-service tools.
 */
import { SACH_SARAH_SYSTEM_PROMPT } from "../storage/sachAccountingKnowledge.js";
import {
    bookConsultationForClient,
    createServiceRequestDraft,
    getClientProfile,
    listServiceRequestsForClient,
    registerServiceDocument,
    saveClientProfile,
    submitServiceRequest,
    updateServiceRequestDraft,
} from "./sachAccountingServiceRequestService.js";
import {
    formatWorkflowGuidanceForSarah,
    getWorkflowPack,
    listIntakeGaps,
} from "./sachAccountingWorkflowPacks.js";

function formatServiceSummary(req, { title = "Service request summary" } = {}) {
    const lines = [
        `**${title}**`,
        `• **Reference:** ${req.reference || req.requestId}`,
        `• **Service:** ${req.serviceType || "—"}`,
        `• **Categories:** ${(req.categories || []).join(", ") || "—"}`,
        `• **Period:** ${req.reportingPeriod || "—"}`,
        `• **Status:** ${req.status || "new"}`,
        `• **Summary:** ${req.summary || "—"}`,
    ];
    if (req.business?.legalName) lines.push(`• **Business:** ${req.business.legalName}`);
    if (req.documentChecklist?.length) {
        const pending = req.documentChecklist.filter((d) => d.status === "requested" && d.required);
        if (pending.length) {
            lines.push(`• **Documents still needed:** ${pending.map((d) => d.label).join(", ")}`);
        }
    }
    return lines.join("\n");
}

const getSachServiceWorkflowTool = {
    name: "getSachServiceWorkflow",
    description:
        "Load intake questions and document checklist for a Sach service type (22 workflow packs — all keys in SACH_WORKFLOW_PACK_ORDER). Call when you identify the service.",
    parameters: {
        type: "object",
        properties: {
            serviceType: { type: "string" },
        },
        required: ["serviceType"],
    },
    async execute(_ctx, args = {}) {
        const pack = getWorkflowPack(args.serviceType);
        if (!pack) {
            return {
                ok: false,
                success: false,
                message: `No configured workflow for "${args.serviceType}". Proceed with generic saveSachServiceRequest.`,
            };
        }
        const guidance = formatWorkflowGuidanceForSarah(pack);
        return {
            ok: true,
            success: true,
            message: guidance,
            data: {
                serviceType: pack.serviceType,
                label: pack.label,
                department: pack.department,
                intakeQuestions: pack.intakeQuestions,
                documentChecklist: pack.documentChecklist,
            },
        };
    },
};

const getSachClientContextTool = {
    name: "getSachClientContext",
    description: "Load the signed-in client's profile and open service requests for Sach Accounting.",
    parameters: { type: "object", properties: {} },
    async execute(ctx) {
        const profile = ctx.customerId ? await getClientProfile(ctx.companyId, ctx.customerId).catch(() => null) : null;
        const requests = ctx.customerId
            ? await listServiceRequestsForClient(ctx.companyId, ctx.customerId).catch(() => [])
            : [];
        const open = requests.filter((r) => !["closed", "cancelled", "completed"].includes(r.status));
        return {
            ok: true,
            success: true,
            message: open.length
                ? `You have ${open.length} open service request(s) with Sach.`
                : "No open service requests on file — I can start a new enquiry.",
            data: { profile, requests, openCount: open.length },
        };
    },
};

const saveSachClientProfileTool = {
    name: "saveSachClientProfile",
    description: "Save client or business profile fields learned in conversation (contact, business identity, services interest).",
    parameters: {
        type: "object",
        properties: {
            clientType: { type: "string", enum: ["individual", "business"] },
            fullName: { type: "string" },
            businessLegalName: { type: "string" },
            tradingName: { type: "string" },
            cipcNumber: { type: "string" },
            contactPhone: { type: "string" },
            contactEmail: { type: "string" },
            industry: { type: "string" },
            notes: { type: "string" },
        },
    },
    async execute(ctx, args = {}) {
        if (!ctx.customerId) return { ok: false, success: false, message: "Sign in to save your profile." };
        const patch = {
            clientType: args.clientType,
            fullName: args.fullName || ctx.customerName,
            business: {
                legalName: args.businessLegalName,
                tradingName: args.tradingName,
                cipcNumber: args.cipcNumber,
                industry: args.industry,
            },
            contact: {
                phone: args.contactPhone || ctx.customerPhone,
                email: args.contactEmail,
            },
            notes: args.notes,
        };
        const saved = await saveClientProfile(ctx.companyId, ctx.customerId, patch);
        return { ok: true, success: true, message: "Profile saved.", data: saved };
    },
};

const saveSachServiceRequestTool = {
    name: "saveSachServiceRequest",
    description:
        "Create or update a structured accounting service request. Collect conversationally: service type, categories, period, business name, summary. Call repeatedly as you learn more.",
    parameters: {
        type: "object",
        properties: {
            requestId: { type: "string", description: "Existing draft id from a prior save" },
            serviceType: { type: "string", description: "e.g. vat, bookkeeping, payroll_monthly, cipc_annual_return" },
            categories: { type: "array", items: { type: "string" } },
            reportingPeriod: { type: "string", description: "e.g. 2026-01, tax year 2025, Oct 2025 payroll" },
            urgency: { type: "string", enum: ["low", "normal", "high"] },
            summary: { type: "string" },
            conversationSummary: { type: "string" },
            businessLegalName: { type: "string" },
            tradingName: { type: "string" },
            cipcNumber: { type: "string" },
            contactPhone: { type: "string" },
            contactEmail: { type: "string" },
            nextAction: { type: "string" },
            intakeAnswers: {
                type: "object",
                description: "Key-value answers matching workflow field ids (e.g. vat_period, payroll_month).",
                additionalProperties: { type: "string" },
            },
        },
    },
    async execute(ctx, args = {}) {
        if (!ctx.customerId) return { ok: false, success: false, message: "Sign in to save a service request." };
        const business = {
            legalName: args.businessLegalName,
            tradingName: args.tradingName,
            cipcNumber: args.cipcNumber,
        };
        const contact = {
            phone: args.contactPhone || ctx.customerPhone,
            email: args.contactEmail,
            fullName: ctx.customerName,
        };
        let summary;
        try {
            if (args.requestId) {
                summary = await updateServiceRequestDraft(ctx.companyId, ctx.customerId, args.requestId, {
                    serviceType: args.serviceType,
                    categories: args.categories,
                    reportingPeriod: args.reportingPeriod,
                    urgency: args.urgency,
                    summary: args.summary,
                    conversationSummary: args.conversationSummary,
                    business,
                    contact,
                    nextAction: args.nextAction,
                    intakeAnswers: args.intakeAnswers,
                });
            } else {
                summary = await createServiceRequestDraft(ctx.companyId, ctx.customerId, {
                    serviceType: args.serviceType || "consultation",
                    categories: args.categories || ["general"],
                    reportingPeriod: args.reportingPeriod,
                    urgency: args.urgency || "normal",
                    summary: args.summary,
                    conversationSummary: args.conversationSummary,
                    business,
                    contact,
                    nextAction: args.nextAction,
                    intakeAnswers: args.intakeAnswers,
                });
            }
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Could not save request." };
        }
        const pack = getWorkflowPack(summary.serviceType);
        let gapNote = "";
        if (pack && summary.intakeAnswers) {
            const gaps = listIntakeGaps(pack, summary.intakeAnswers);
            if (gaps.length) gapNote = `\n\nStill to collect: ${gaps[0].prompt}`;
        }
        const block = formatServiceSummary(summary, { title: "Saved — please confirm" });
        return {
            ok: true,
            success: true,
            message:
                `Saved service request **${summary.reference}** (draft).\n\n${block}${gapNote}\n\n` +
                `When this is correct, I will ask for your confirmation to submit to the Sach team.`,
            data: { ...summary, requestId: summary.requestId },
            uiHints: [{ type: "sachServiceSummary", reference: summary.reference, fields: block }],
        };
    },
};

const submitSachServiceRequestTool = {
    name: "submitSachServiceRequest",
    description: "Submit the saved service request after the client confirms the summary.",
    parameters: {
        type: "object",
        properties: { requestId: { type: "string" } },
        required: ["requestId"],
    },
    async execute(ctx, args = {}) {
        try {
            const submitted = await submitServiceRequest(ctx.companyId, ctx.customerId, args.requestId);
            const block = formatServiceSummary(submitted, { title: "Submitted to Sach Accounting" });
            return {
                ok: true,
                success: true,
                message: `Request submitted as **${submitted.reference}**. Our team will review and respond.\n\n${block}`,
                data: submitted,
            };
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Submit failed." };
        }
    },
};

const registerSachServiceDocumentTool = {
    name: "registerSachServiceDocument",
    description: "Register a document the client attached in chat against their service request.",
    parameters: {
        type: "object",
        properties: {
            requestId: { type: "string" },
            documentType: { type: "string" },
            fileName: { type: "string" },
            uploadId: { type: "string" },
        },
        required: ["requestId", "documentType", "fileName"],
    },
    async execute(ctx, args = {}) {
        try {
            const storageRef = args.uploadId ? `chat-media:${args.uploadId}` : null;
            const updated = await registerServiceDocument(ctx.companyId, ctx.customerId, args.requestId, {
                type: args.documentType,
                fileName: args.fileName,
                storageRef,
                label: args.fileName,
            });
            return { ok: true, success: true, message: `Registered ${args.fileName} on ${updated.reference}.`, data: updated };
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Could not register document." };
        }
    },
};

const bookSachConsultationTool = {
    name: "bookSachConsultation",
    description: "Book a consultation after collecting matter summary, contact details, and preferred slot.",
    parameters: {
        type: "object",
        properties: {
            consultationType: { type: "string" },
            clientName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            matterSummary: { type: "string" },
            preferredSlot: { type: "string", description: "Human-readable preferred date/time" },
            scheduledAt: { type: "string", description: "ISO datetime if agreed" },
        },
        required: ["matterSummary"],
    },
    async execute(ctx, args = {}) {
        if (!ctx.customerId) return { ok: false, success: false, message: "Sign in to book a consultation." };
        try {
            const result = await bookConsultationForClient(ctx.companyId, ctx.customerId, {
                ...args,
                contactName: args.clientName || ctx.customerName,
            });
            return { ok: true, success: true, message: result.message, data: result };
        } catch (err) {
            return { ok: false, success: false, message: err.message || "Could not book consultation." };
        }
    },
};

export const SACH_ACCOUNTING_CHAT_TOOLS = [
    getSachClientContextTool,
    getSachServiceWorkflowTool,
    saveSachClientProfileTool,
    saveSachServiceRequestTool,
    submitSachServiceRequestTool,
    registerSachServiceDocumentTool,
    bookSachConsultationTool,
];

export const SACH_ACCOUNTING_TOOL_NAMES = SACH_ACCOUNTING_CHAT_TOOLS.map((t) => t.name);

export function getSachOpenAIToolDefinitions(toolNames = SACH_ACCOUNTING_TOOL_NAMES) {
    const allowed = new Set(toolNames);
    return SACH_ACCOUNTING_CHAT_TOOLS.filter((t) => allowed.has(t.name)).map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}

export function extractSachUiHints(toolResults = []) {
    const hints = [];
    for (const row of toolResults || []) {
        const bag = row?.uiHints || row?.result?.uiHints;
        if (Array.isArray(bag)) hints.push(...bag);
    }
    return hints;
}

export function buildSachCompanySarahGreeting(preferredName, companyName) {
    const name = preferredName || "there";
    return (
        `Hello ${name}! I'm Sarah from ${companyName || "Sach Accounting Solutions"}.\n\n` +
        `I can help with **accounting and bookkeeping**, **tax and SARS matters**, **payroll**, **CIPC and company compliance**, **quotations**, and **booking a consultation** — all here in chat.\n\n` +
        `What can we help you with today?`
    );
}

export { SACH_SARAH_SYSTEM_PROMPT };