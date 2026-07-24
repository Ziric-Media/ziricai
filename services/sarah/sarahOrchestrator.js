/**
 * Sarah orchestrator — OpenAI function-calling conversation loop + demo fallback.
 */
import OpenAI from "openai";
import dotenv from "dotenv";
import { buildSarahSystemPrompt } from "./prompts/systemPrompt.js";
import { getOpenAIToolDefinitions, executeTool } from "./toolRegistry.js";
import { initSarahTools } from "./tools/index.js";
import {
    getOrCreateSession,
    appendMessage,
    recordAction,
    getSessionHistory,
    getSessionContext,
    setSessionContext,
} from "./sarahMemory.js";
import {
    matchPlatformQuestion,
    getPlatformAnswer,
    PLATFORM_DEFAULT_REPLY,
} from "./platformKnowledge.js";

dotenv.config();

initSarahTools();

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const DEMO_INTENTS = [
    { keys: ["analytic", "metric", "report", "dashboard", "stats"], tool: "viewAnalytics", args: {} },
    { keys: ["conversation", "inbox", "message", "chat"], tool: "viewConversations", args: {} },
    { keys: ["crm", "customer", "lead", "contact", "search"], tool: "searchCRM", args: { query: "", type: "all" } },
    {
        keys: ["create employee", "create ai", "new ai", "named"],
        tool: "createEmployee",
        args: { name: "Emma", role: "Reception" },
    },
    {
        keys: ["train", "training", "fine-tune"],
        tool: "trainAI",
        args: { instruction: "Use a warm, professional tone." },
    },
    {
        keys: ["upload", "add faq", "add document", "knowledge base"],
        tool: "uploadKnowledge",
        args: { title: "FAQ", content: "Add your FAQ content here.", type: "faq" },
    },
    { keys: ["billing", "invoice"], tool: "viewBilling", args: {} },
    { keys: ["connect whatsapp", "whatsapp setup"], tool: "connectWhatsApp", args: {} },
    { keys: ["quote", "quotation"], tool: "generateQuote", args: { customerName: "Customer", items: [{ description: "Service", amount: 0 }] } },
    { keys: ["appointment", "book", "schedule"], tool: "bookAppointment", args: { customerName: "Customer", scheduledAt: "tomorrow 2pm", service: "Consultation" } },
];

function extractEmployeeFromMessage(message) {
    const lower = message.toLowerCase();
    const createMatch = lower.match(/create\s+(?:a\s+)?(?:reception|sales|support|funeral)?\s*ai\s+(?:named|called)\s+(\w+)/i);
    if (createMatch) return { name: createMatch[1], role: "Reception" };
    const roleMatch = lower.match(/create\s+(?:a\s+)?(reception|sales|support|funeral)\s+ai/i);
    if (roleMatch) return { name: "Emma", role: roleMatch[1] };
    return null;
}

function matchDemoIntent(message, sessionContext = {}) {
    const lower = message.toLowerCase();

    const employeeHint = extractEmployeeFromMessage(message);
    if (employeeHint) {
        return { tool: "createEmployee", args: employeeHint };
    }

    if (/\btrain\b/.test(lower) && (sessionContext.lastAgentName || /\b(ai|employee|agent)\b/.test(lower))) {
        return {
            tool: "trainAI",
            args: {
                employeeName: sessionContext.lastAgentName,
                instruction: message,
            },
        };
    }

    for (const intent of DEMO_INTENTS) {
        if (intent.keys.some((k) => lower.includes(k))) {
            const args = { ...intent.args };
            if (intent.tool === "searchCRM") {
                const words = lower.replace(/search|crm|customer|find/gi, "").trim();
                args.query = words || "a";
            }
            if (intent.tool === "uploadKnowledge" && sessionContext.lastAgentName) {
                args.employeeName = sessionContext.lastAgentName;
            }
            if (intent.tool === "createEmployee" && /\bemployee\b|\bagent\b/.test(lower)) {
                const nameMatch = lower.match(/named?\s+(\w+)/);
                if (nameMatch) args.name = nameMatch[1];
            }
            return { tool: intent.tool, args };
        }
    }
    return null;
}

async function runDemoMode(ctx, message, session) {
    const sessionContext = getSessionContext(session.id);
    const platformMatch = matchPlatformQuestion(message);

    if (platformMatch && !matchDemoIntent(message, sessionContext)) {
        const reply = platformMatch.answer;
        appendMessage(session.id, "user", message);
        appendMessage(session.id, "assistant", reply);
        return { reply, sessionId: session.id, actions: [], uiHints: [], mode: "demo" };
    }

    const intent = matchDemoIntent(message, sessionContext);
    const actions = [];
    let uiHints = [];

    if (intent) {
        const result = await executeTool(intent.tool, ctx, intent.args);
        actions.push(result);
        uiHints = result.uiHints || [];
        recordAction(session.id, { tool: intent.tool, success: result.success });

        if (intent.tool === "createEmployee" && result.data?.employee) {
            setSessionContext(session.id, {
                lastAgentId: result.data.agentId,
                lastAgentName: result.data.employee.name,
                lastKnowledgeBaseId: result.data.knowledgeBaseId,
            });
        }

        const reply = result.message || result.error || "Done.";
        appendMessage(session.id, "user", message);
        appendMessage(session.id, "assistant", reply);
        return { reply, sessionId: session.id, actions, uiHints, mode: "demo" };
    }

    if (platformMatch) {
        appendMessage(session.id, "user", message);
        appendMessage(session.id, "assistant", platformMatch.answer);
        return {
            reply: platformMatch.answer,
            sessionId: session.id,
            actions,
            uiHints,
            mode: "demo",
        };
    }

    const fallback = getPlatformAnswer("general").answer || PLATFORM_DEFAULT_REPLY;
    appendMessage(session.id, "user", message);
    appendMessage(session.id, "assistant", fallback);
    return { reply: fallback, sessionId: session.id, actions, uiHints, mode: "demo" };
}

/**
 * Main Sarah chat handler.
 * @param {object} ctx — from buildSarahContext
 * @param {{ message: string, sessionId?: string }} input
 */
export async function handleSarahChat(ctx, input) {
    const message = String(input.message || "").trim();
    if (!message) {
        return { reply: "Please send a message.", sessionId: input.sessionId || null, actions: [], uiHints: [] };
    }

    const session = getOrCreateSession(input.sessionId, ctx.companyId);
    ctx.sessionId = session.id;
    ctx.lastUserMessage = message;
    ctx.message = message;

    if (!openai) {
        return runDemoMode(ctx, message, session);
    }

    const history = getSessionHistory(session.id);
    const systemPrompt = buildSarahSystemPrompt(ctx);
    const tools = getOpenAIToolDefinitions(ctx);

    const messages = [{ role: "system", content: systemPrompt }];
    for (const turn of history) {
        messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content });
    }
    messages.push({ role: "user", content: message });

    const actions = [];
    let uiHints = [];
    let reply = "";
    const maxToolRounds = 3;

    try {
        let round = 0;
        let currentMessages = [...messages];

        while (round < maxToolRounds) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages: currentMessages,
                tools: tools.length ? tools : undefined,
                tool_choice: tools.length ? "auto" : undefined,
                max_tokens: 800,
            });

            const choice = response.choices[0]?.message;
            if (!choice) break;

            if (choice.tool_calls?.length) {
                currentMessages.push(choice);

                for (const call of choice.tool_calls) {
                    const fnName = call.function.name;
                    let fnArgs = {};
                    try {
                        fnArgs = JSON.parse(call.function.arguments || "{}");
                    } catch {
                        fnArgs = {};
                    }

                    const sessionCtx = getSessionContext(session.id);
                    if (fnName === "uploadKnowledge" || fnName === "trainAI") {
                        if (!fnArgs.employeeName && sessionCtx.lastAgentName) {
                            fnArgs.employeeName = sessionCtx.lastAgentName;
                        }
                    }

                    const result = await executeTool(fnName, ctx, fnArgs);
                    actions.push(result);
                    if (result.uiHints) uiHints.push(...result.uiHints);
                    recordAction(session.id, { tool: fnName, success: result.success });

                    if (fnName === "createEmployee" && result.data?.employee) {
                        setSessionContext(session.id, {
                            lastAgentId: result.data.agentId,
                            lastAgentName: result.data.employee.name,
                            lastKnowledgeBaseId: result.data.knowledgeBaseId,
                        });
                    }

                    currentMessages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: JSON.stringify(result),
                    });
                }

                round++;
                continue;
            }

            reply = (choice.content || "").trim();
            break;
        }

        if (!reply && actions.length) {
            reply = actions.map((a) => a.message || a.error).filter(Boolean).join("\n\n");
        }
        if (!reply) reply = "I completed the requested action. Anything else?";

        appendMessage(session.id, "user", message);
        appendMessage(session.id, "assistant", reply);

        return {
            reply,
            sessionId: session.id,
            actions,
            uiHints: dedupeUiHints(uiHints),
            mode: "openai",
        };
    } catch (err) {
        console.error("[sarah] OpenAI error:", err.message);
        return runDemoMode(ctx, message, session);
    }
}

function dedupeUiHints(hints) {
    const seen = new Set();
    return hints.filter((h) => {
        const key = JSON.stringify(h);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export { initSarahTools };
