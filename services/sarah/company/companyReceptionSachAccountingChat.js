/**
 * Company Sarah — Sach Accounting client-service vertical.
 */
import { askAIWithTools } from "../../openai.js";
import { buildEmployeeSystemPrompt } from "../../ai-core/employeePrompts.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import { shouldRunAutomotiveSalesChat } from "./companyReceptionAutomotiveChat.js";
import { shouldRunDentalReceptionChat } from "./companyReceptionDentalChat.js";
import { shouldRunEducareSchoolChat } from "../../education/educareIndustryPreset.js";
import { shouldRunSachAccountingChat } from "../../consulting/sachAccountingIndustryPreset.js";
import {
    SACH_ACCOUNTING_CHAT_TOOLS,
    SACH_SARAH_SYSTEM_PROMPT,
    getSachOpenAIToolDefinitions,
    extractSachUiHints,
} from "../../consulting/sachAccountingChatTools.js";
import { SARAH_SOLE_CONTACT_RULES } from "./sarahSoleContactChannelRules.js";
import {
    assistantAwaitedSubmissionConfirm,
    isAffirmativeConfirmation,
} from "../../consulting/sachAccountingClientConfirm.js";
import { findLatestEditableDraft } from "../../consulting/sachAccountingServiceRequestService.js";

const CHANNEL = "sarah_app";

function resolveConsumerPhone(profile = {}) {
    const raw =
        profile.phone ||
        profile.mobile ||
        profile.phoneNumber ||
        profile.mobileNumber ||
        profile.contactPhone ||
        "";
    return String(raw || "").trim();
}

/**
 * @param {string} companyId
 */
export async function shouldRunSachAccountingReceptionChat(companyId) {
    if (await shouldRunAutomotiveSalesChat(companyId)) return false;
    if (await shouldRunDentalReceptionChat(companyId)) return false;
    if (await shouldRunEducareSchoolChat(companyId)) return false;
    return shouldRunSachAccountingChat(companyId);
}

async function runSachTool(name, ctx, args = {}) {
    const tool = SACH_ACCOUNTING_CHAT_TOOLS.find((t) => t.name === name);
    if (!tool) {
        return { tool: name, ok: false, success: false, message: `Unknown tool: ${name}` };
    }
    try {
        const result = await tool.execute(ctx, args);
        return { tool: name, ...result };
    } catch (err) {
        return { tool: name, ok: false, success: false, message: err.message || String(err) };
    }
}

const GOVERNANCE_RULES = [
    "Never present yourself as an independent accountant, auditor, tax practitioner, or CIPC authorised representative.",
    "Never claim a VAT/PAYE/CIPC filing is submitted or complete unless a tool and staff workflow confirm it.",
    "Never invent prices, SARS outcomes, deadlines, or CIPC name availability.",
    "Use getSachClientContext for signed-in clients before asking redundant profile questions.",
    "Collect sensitive identifiers minimally; do not repeat ID/tax numbers in summaries unless necessary.",
    "Multiple distinct services in one conversation → separate saveSachServiceRequest drafts when appropriate.",
    "When the service is identified, call getSachServiceWorkflow first, then save intakeAnswers via saveSachServiceRequest.",
    "Present saveSachServiceRequest summary and obtain explicit confirmation before submitSachServiceRequest.",
    "On yes/correct/go ahead: call submitSachServiceRequest with the same requestId — never save again or invent a new reference.",
    "For SARS letters: ask for secure upload and create a tax/SARS request — do not invent dispute outcomes.",
].join("\n");

/**
 * @param {object} params
 */
export async function runCompanySarahSachAccountingTurn(params) {
    const {
        uid,
        companyId,
        companyName,
        consumerDisplayName,
        consumerProfile = {},
        text,
        history = [],
        attachments = [],
        conversationId = null,
    } = params;

    const displayName =
        consumerDisplayName ||
        consumerProfile.preferredName ||
        consumerProfile.firstName ||
        consumerProfile.displayName ||
        "Guest";
    const customerPhone = resolveConsumerPhone(consumerProfile);
    const signedIn = Boolean(uid);

    const agentRow = await listAiEmployees(companyId).then(
        (rows) => rows.find((e) => e.isDefault) || rows[0] || null
    );

    const knowledgeBundle = await retrieveAgentKnowledgeContext(companyId, text, agentRow).catch(() => ({
        agent: agentRow,
        context: "",
        sources: [],
    }));
    const agent = knowledgeBundle.agent || agentRow;

    const roleLabel = agent?.role || agent?.title || "Client services & accounting intake";
    const basePrompt = buildEmployeeSystemPrompt({
        companyName,
        roleLabel,
        customPrompt: agent?.systemPrompt || SACH_SARAH_SYSTEM_PROMPT,
    });

    const phoneLine = customerPhone
        ? `Client phone on profile: ${customerPhone} — reference when helpful, do not repeat unnecessarily.`
        : "No phone on profile — ask for a reachable number before booking consultations or submitting requests.";

    const authLine = signedIn
        ? "Client is signed in — use authenticated client context tools."
        : "Client is not signed in — explain that signing in lets them track service requests; still answer general questions and offer consultation booking when contact details are collected.";

    const channelRules = [
        "CHANNEL: Sarah App — Sach Accounting Solutions.",
        SARAH_SOLE_CONTACT_RULES,
        phoneLine,
        authLine,
        `Client display name: ${displayName}.`,
        GOVERNANCE_RULES,
        "For service plans or fees, explain from COMPANY KNOWLEDGE and note that staff confirm binding quotes.",
        "If the client attached a file, register it with registerSachServiceDocument when you have requestId and document type.",
    ].join("\n");

    const knowledgeBlock = knowledgeBundle.context
        ? `\n\nCOMPANY KNOWLEDGE (verified — do not contradict tools):\n${knowledgeBundle.context}`
        : "";

    const toolCtx = {
        companyId,
        customerId: uid,
        customerPhone,
        customerName: displayName,
        agentId: agent?.id || null,
        channel: CHANNEL,
        inboundMessage: text,
        inboundAttachments: Array.isArray(attachments) ? attachments : [],
        conversationId,
    };

    const chatHistory = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-18)
        .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || "").slice(0, 4000),
        }));

    if (
        signedIn &&
        isAffirmativeConfirmation(text) &&
        assistantAwaitedSubmissionConfirm(history)
    ) {
        const draft = await findLatestEditableDraft(companyId, uid).catch(() => null);
        if (draft?.requestId && draft.status === "new") {
            const submitted = await runSachTool("submitSachServiceRequest", toolCtx, {
                requestId: draft.requestId,
            });
            if (submitted.ok) {
                return {
                    reply:
                        `${submitted.message}\n\nOur team will follow up on **${submitted.data?.reference || draft.reference}**. ` +
                        `Is there anything else I can help you with today?`,
                    toolResults: [submitted],
                    uiHints: extractSachUiHints([submitted]),
                };
            }
        }
    }

    const aiResult = await askAIWithTools(text, {
        history: chatHistory,
        systemPrompt: `${basePrompt}\n\n${SACH_SARAH_SYSTEM_PROMPT}\n\n${channelRules}${knowledgeBlock}`,
        tools: getSachOpenAIToolDefinitions(),
        executeTool: (name, args) => runSachTool(name, toolCtx, args),
        maxToolRounds: 5,
    });

    return {
        reply:
            aiResult.reply ||
            "Welcome to Sach Accounting Solutions. I can help with accounting, tax, payroll, CIPC compliance, quotations, and booking a consultation. What do you need today?",
        toolResults: aiResult.toolResults || [],
        uiHints: extractSachUiHints(aiResult.toolResults || []),
    };
}

export { buildSachCompanySarahGreeting, extractSachUiHints } from "../../consulting/sachAccountingChatTools.js";