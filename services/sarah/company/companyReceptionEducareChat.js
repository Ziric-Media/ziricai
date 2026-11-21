/**
 * Sarah App — Educare school reception (registration-first + verified-guardian support).
 */
import { askAIWithTools } from "../../openai.js";
import { buildEmployeeSystemPrompt } from "../../ai-core/employeePrompts.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import { shouldRunDentalReceptionChat } from "./companyReceptionDentalChat.js";
import { shouldRunAutomotiveSalesChat } from "./companyReceptionAutomotiveChat.js";
import { shouldRunEducareSchoolChat } from "../../education/educareIndustryPreset.js";
import {
    EDUCARE_SARAH_SYSTEM_PROMPT,
    EDUCARE_SCHOOL_CHAT_TOOLS,
    getEducareOpenAIToolDefinitions,
    getParentEducareStatusSummary,
} from "../../education/educareSchoolChatTools.js";
import { SARAH_SOLE_CONTACT_RULES } from "./sarahSoleContactChannelRules.js";

const CHANNEL = "sarah_app";

/**
 * @param {string} companyId
 */
export async function shouldRunEducareReceptionChat(companyId) {
    if (await shouldRunAutomotiveSalesChat(companyId)) return false;
    if (await shouldRunDentalReceptionChat(companyId)) return false;
    return shouldRunEducareSchoolChat(companyId);
}

/**
 * @param {string} name
 * @param {object} ctx
 * @param {object} args
 */
async function runEducareTool(name, ctx, args = {}) {
    const tool = EDUCARE_SCHOOL_CHAT_TOOLS.find((t) => t.name === name);
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

function modeDirective(status) {
    if (status.mode === "verified_guardian") {
        return [
            "PARENT MODE: VERIFIED GUARDIAN — treat this parent as enrolled at the school.",
            `Verified learner links: ${status.approvedGuardianLinks}. Pending links: ${status.pendingGuardianLinks}.`,
            "Primary goal: resolve concerns empathically — step by step (child name, grade, describe issue, optional extra).",
            "When they confirm escalation, call logParentConcern with the collected fields.",
            "Never invent outcomes; offer Speak to Admin / human handover for urgent safety, abuse, or fee disputes.",
            "Do not push new registration unless they ask about another child not yet at the school.",
        ].join("\n");
    }
    return [
        "PARENT MODE: PROSPECT — not yet a verified guardian.",
        "Primary goal: conversational new enquiry — ask one question at a time (child name, age or DOB, gender, grade, campus, parent contact).",
        "Use saveEducareAdmissionFromChat as fields are collected; submitEducareAdmissionFromChat after they confirm and consent.",
        "Never open an external form or tell them to call/email the school.",
        "Never claim a child is enrolled or admitted without tool confirmation.",
        "Tone: warm Educare reception — welcoming, clear, one follow-up at a time.",
    ].join("\n");
}

/**
 * @param {object} params
 */
export async function runCompanySarahEducareTurn(params) {
    const {
        uid,
        companyId,
        companyName,
        consumerDisplayName,
        consumerProfile = {},
        text,
        history = [],
        attachments = [],
    } = params;

    const displayName =
        consumerDisplayName ||
        consumerProfile.preferredName ||
        consumerProfile.firstName ||
        consumerProfile.displayName ||
        "Guest";
    const customerPhone = resolveConsumerPhone(consumerProfile);

    const parentStatus = await getParentEducareStatusSummary(companyId, uid);

    const agentRow = await listAiEmployees(companyId).then(
        (rows) => rows.find((e) => e.isDefault) || rows[0] || null
    );

    const knowledgeBundle = await retrieveAgentKnowledgeContext(companyId, text, agentRow).catch(() => ({
        agent: agentRow,
        context: "",
        sources: [],
    }));
    const agent = knowledgeBundle.agent || agentRow;

    const roleLabel = agent?.role || agent?.title || "School information & admissions";
    const basePrompt = buildEmployeeSystemPrompt({
        companyName,
        roleLabel,
        customPrompt: agent?.systemPrompt || EDUCARE_SARAH_SYSTEM_PROMPT,
    });

    const phoneLine = customerPhone
        ? `Parent mobile on profile: ${customerPhone} — you may reference it but do not repeat unnecessarily.`
        : "No mobile on profile — ask for a reachable number when logging concerns or before suggesting they submit admission forms.";

    const channelRules = [
        "CHANNEL: Sarah App consumer chat with Educare (not legacy WhatsApp).",
        SARAH_SOLE_CONTACT_RULES,
        phoneLine,
        `Parent display name: ${displayName}.`,
        "Call getParentEducareStatus when unsure whether to focus on registration or parent support.",
        "Never say a registration was submitted unless submitEducareAdmissionFromChat returned success.",
        "Never say a concern was escalated unless logParentConcern returned success.",
        "For factual policy (fees, transport, boarding, uniform prices, availability) use COMPANY KNOWLEDGE — if missing, say you will note it for management in the portal.",
        "If the parent attached a file, register it with registerEducareAdmissionDocument when you know the applicationId and document type.",
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
    };

    const chatHistory = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-18)
        .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || "").slice(0, 4000),
        }));

    const aiResult = await askAIWithTools(text, {
        history: chatHistory,
        systemPrompt: `${basePrompt}\n\n${EDUCARE_SARAH_SYSTEM_PROMPT}\n\n${modeDirective(parentStatus)}\n\n${channelRules}${knowledgeBlock}`,
        tools: getEducareOpenAIToolDefinitions(),
        executeTool: (name, args) => runEducareTool(name, toolCtx, args),
        maxToolRounds: 5,
    });

    return {
        reply:
            aiResult.reply ||
            (parentStatus.mode === "verified_guardian"
                ? "I'm here to help — tell me which child and what concern you'd like us to address."
                : "Welcome! I can answer questions and help you start an enrolment enquiry right here. What grade is your child going into?"),
        toolResults: aiResult.toolResults || [],
        parentMode: parentStatus.mode,
    };
}