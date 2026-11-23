/**
 * Sarah App — automotive sales + test-drive booking (same AI tools as WhatsApp).
 */
import { initAiTools, getOpenAIToolDefinitions, runTool } from "../../tools/index.js";
import { askAIWithTools } from "../../openai.js";
import { buildWhatsAppSystemPrompt } from "../../ai-core/whatsappConversationPrompt.js";
import { resolveSarahAppCustomerId } from "../../storage/tenantStorage.js";
import { getSchedulingContext, sanitizeSchedulingContext } from "../../conversation/schedulingContext.js";
import { toBusinessDateString, getTodayStartInBusinessTz } from "../../tools/availability.js";
import { getTestDrivePlan } from "../../conversation/testDrivePlan.js";
import { getRecommendedVehicles } from "../../conversation/recommendedVehicles.js";
import { listAiEmployees } from "../../tenants/aiEmployeeService.js";
import { getPortalCompanyAsync } from "../../portal/portalDemo.js";
import { isAutomotivePresetConfigured } from "../../automotive/automotiveIndustryPreset.js";
import { listVehiclesByCompany } from "../../inventory/inventoryService.js";
import { resolveSarahAppInventoryCompanyId } from "../../storage/centralMotorsPilot.js";
import { retrieveAgentKnowledgeContext } from "../../ai-core/aiCoreBridge.js";
import { EDUCARE_COMPANY_ID } from "../../education/educareDefaults.js";

const CHANNEL = "sarah_app";

/**
 * @param {string} companyId
 */
function isEducationSchoolTenant(record) {
    const hay = `${record?.industry || ""} ${record?.category || ""} ${record?.businessType || ""}`.toLowerCase();
    return hay.includes("school") || hay.includes("education");
}

export async function shouldRunAutomotiveSalesChat(companyId) {
    if (companyId === EDUCARE_COMPANY_ID) return false;
    const company = await getPortalCompanyAsync(companyId).catch(() => null);
    const record = company?.company || company;
    if (isEducationSchoolTenant(record)) return false;
    if (isAutomotivePresetConfigured(record)) return true;
    const inventoryCompanyId = resolveSarahAppInventoryCompanyId(companyId);
    const inv = await listVehiclesByCompany(inventoryCompanyId).catch(() => []);
    return inv.length > 0;
}

/**
 * @param {object} params
 * @param {string} params.uid
 * @param {string} params.companyId
 * @param {string} params.companyName
 * @param {string} [params.consumerDisplayName]
 * @param {string} params.text
 * @param {object[]} [params.history]
 */
export async function runCompanySarahAutomotiveTurn(params) {
    const { uid, companyId, companyName, consumerDisplayName, text, history = [] } = params;
    initAiTools();

    const customerId = resolveSarahAppCustomerId(uid);
    const displayName = consumerDisplayName || "Guest";

    const agentRow = await listAiEmployees(companyId).then((rows) => rows.find((e) => e.isDefault) || rows[0] || null);

    const [rawScheduling, testDrivePlan, recommended, knowledgeBundle] = await Promise.all([
        getSchedulingContext(companyId, uid, CHANNEL),
        getTestDrivePlan(companyId, uid, CHANNEL),
        getRecommendedVehicles(companyId, uid, CHANNEL),
        retrieveAgentKnowledgeContext(companyId, text, agentRow).catch(() => ({
            agent: agentRow,
            context: "",
            sources: [],
        })),
    ]);
    const agent = knowledgeBundle.agent || agentRow;
    const schedulingContext = sanitizeSchedulingContext(rawScheduling);
    const todaySast = toBusinessDateString(getTodayStartInBusinessTz());

    const systemPrompt = buildWhatsAppSystemPrompt({
        agent,
        companyId,
        companyName,
        customer: { displayName, name: displayName },
        contactName: displayName,
    });

    const channelRules = [
        "CHANNEL: Sarah App consumer chat (not WhatsApp).",
        `TODAY (SAST) for this thread: ${todaySast}. Never list or confirm test-drive dates before this date.`,
        "Use checkTestDriveAvailability and bookTestDrive exactly as on WhatsApp.",
        "Never list appointment times or calendar dates unless checkTestDriveAvailability ran in this turn and returned suggestedSlots.",
        "Never confirm a test drive unless bookTestDrive returns ok:true with an appointment id.",
        "Persist bookings to the company appointment calendar automatically via tools.",
        "Never say 'just a moment' or 'I'll send details shortly' — call searchInventory and complete your answer in this reply; vehicle photos are attached by the platform.",
        "When you promise SUVs, sedans, or bakkies, call searchInventory with the matching body type and only list vehicles from that tool result — never attach a different body type.",
        "Number your suggestions (1. 2. 3.) with full year make model titles; photos are shown in that same order.",
        "Do NOT promise automatic photo attachments — the customer receives photos only when they ask for pictures/photos or say yes after you offer them.",
        "Team/staff/dealer principal questions: answer from COMPANY KNOWLEDGE only — never searchInventory or vehicle photos on those turns.",
        "For team / staff / who-works-here questions, use COMPANY KNOWLEDGE below — do not invent names.",
        "Finance, trade-in, or callback with enough customer details: call recordSalesEnquiry — confirm Michelle/Omar follow-up only after the tool returns ok.",
        "Never promise approved finance rates or final trade-in values without human confirmation.",
    ].join("\n");

    const knowledgeBlock = knowledgeBundle.context
        ? `\n\nCOMPANY KNOWLEDGE (verified — staff, policies, hours; do not contradict inventory tools):\n${knowledgeBundle.context}`
        : "";

    const toolCtx = {
        companyId,
        customerId,
        customerPhone: uid,
        customerName: displayName,
        agentId: agent?.id || null,
        channel: CHANNEL,
        inboundMessage: text,
        schedulingContext,
        testDrivePlan,
        lastRecommendedVehicles: recommended,
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
        systemPrompt: `${systemPrompt}\n\n${channelRules}${knowledgeBlock}`,
        tools: getOpenAIToolDefinitions(),
        executeTool: (name, args) => runTool(name, toolCtx, args),
        maxToolRounds: 4,
    });

    return {
        reply: aiResult.reply || "Thanks for your message. How can I help with stock or a test drive?",
        toolResults: aiResult.toolResults || [],
    };
}
