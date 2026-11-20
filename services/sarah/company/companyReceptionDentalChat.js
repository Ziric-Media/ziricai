/**
 * Sarah App — dental reception + booking diary (same tools as WhatsApp / portal operations).
 */
import { askAIWithTools } from "../../openai.js";
import { buildEmployeeSystemPrompt } from "../../ai-core/employeePrompts.js";
import { getPortalCompanyAsync } from "../../portal/portalDemo.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import { isDentalPracticeCompany } from "../../dental/dentalIndustryPreset.js";
import {
    smilemorePracticePrompt,
    SMILEMORE_WHATSAPP_TOOL_NAMES,
} from "../../dental/smilemorePractice.js";
import { SMILEMORE_DENTAL_TOOLS } from "../../dental/dentalBookingTools.js";
import { toBusinessDateString, getTodayStartInBusinessTz } from "../../tools/availability.js";
import { shouldRunAutomotiveSalesChat } from "./companyReceptionAutomotiveChat.js";

const CHANNEL = "sarah_app";

/**
 * @param {string[]} [toolNames]
 */
export function getDentalOpenAIToolDefinitions(toolNames = SMILEMORE_WHATSAPP_TOOL_NAMES) {
    const allowed = new Set(toolNames);
    return SMILEMORE_DENTAL_TOOLS.filter((t) => allowed.has(t.name)).map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}

/**
 * @param {string} companyId
 */
export async function shouldRunDentalReceptionChat(companyId) {
    if (await shouldRunAutomotiveSalesChat(companyId)) return false;
    const company = await getPortalCompanyAsync(companyId).catch(() => null);
    const record = company?.company || company;
    return isDentalPracticeCompany(companyId, record);
}

/**
 * @param {object} profile
 */
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
 * @param {string} name
 * @param {object} ctx
 * @param {object} args
 */
async function runDentalTool(name, ctx, args = {}) {
    const tool = SMILEMORE_DENTAL_TOOLS.find((t) => t.name === name);
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

/**
 * @param {object} params
 * @param {string} params.uid
 * @param {string} params.companyId
 * @param {string} params.companyName
 * @param {string} [params.consumerDisplayName]
 * @param {object} [params.consumerProfile]
 * @param {string} params.text
 * @param {object[]} [params.history]
 */
export async function runCompanySarahDentalTurn(params) {
    const {
        uid,
        companyId,
        companyName,
        consumerDisplayName,
        consumerProfile = {},
        text,
        history = [],
    } = params;

    const displayName =
        consumerDisplayName ||
        consumerProfile.preferredName ||
        consumerProfile.firstName ||
        consumerProfile.displayName ||
        "Guest";
    const customerPhone = resolveConsumerPhone(consumerProfile);

    const agentRow = await listAiEmployees(companyId).then(
        (rows) => rows.find((e) => e.isDefault) || rows[0] || null
    );

    const [knowledgeBundle] = await Promise.all([
        retrieveAgentKnowledgeContext(companyId, text, agentRow).catch(() => ({
            agent: agentRow,
            context: "",
            sources: [],
        })),
    ]);
    const agent = knowledgeBundle.agent || agentRow;
    const todaySast = toBusinessDateString(getTodayStartInBusinessTz());

    const roleLabel = agent?.role || agent?.title || "Reception";
    const basePrompt = buildEmployeeSystemPrompt({
        companyName,
        roleLabel,
        customPrompt: agent?.systemPrompt || null,
    });

    const phoneLine = customerPhone
        ? `Patient phone on file: ${customerPhone} — use for getDentalPatient and createDentalBooking when appropriate.`
        : "No phone on file — ask for a reachable mobile number before createDentalBooking.";

    const channelRules = [
        "CHANNEL: Sarah App consumer chat (not WhatsApp).",
        `TODAY (SAST) for this thread: ${todaySast}.`,
        phoneLine,
        `Customer name for this thread: ${displayName}.`,
        "You are connected to the SmileMore booking diary — same records as the practice portal.",
        "Never say 'checking now', 'hold on', or 'one moment' without calling the matching tool in this turn.",
        "Never list times or say a slot is free unless checkDentalAvailability ran in this turn and returned open slots.",
        "Never say a visit is booked or confirmed unless createDentalBooking or updateDentalBooking returned ok:true.",
        "Map location names to locationId: family-city-square (City Square / family practice), paediatric-senthadi (Senthadi / paediatric).",
        "Default serviceId cleaning-polish for routine visits unless the patient specifies another advertised service.",
        "Use channel sarah_app when creating bookings.",
        "After a successful createDentalBooking, summarise location, date, time, and status (requested vs confirmed).",
    ].join("\n");

    const practiceBlock = smilemorePracticePrompt();
    const knowledgeBlock = knowledgeBundle.context
        ? `\n\nCOMPANY KNOWLEDGE (verified — do not contradict diary tools):\n${knowledgeBundle.context}`
        : "";

    const toolCtx = {
        companyId,
        customerId: uid,
        customerPhone,
        customerName: displayName,
        agentId: agent?.id || null,
        channel: CHANNEL,
        inboundMessage: text,
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
        systemPrompt: `${basePrompt}\n\n${practiceBlock}\n\n${channelRules}${knowledgeBlock}`,
        tools: getDentalOpenAIToolDefinitions(),
        executeTool: (name, args) => runDentalTool(name, toolCtx, args),
        maxToolRounds: 5,
    });

    return {
        reply:
            aiResult.reply ||
            "Thanks for your message. I can help with SmileMore locations, availability, and booking requests.",
        toolResults: aiResult.toolResults || [],
    };
}