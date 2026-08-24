import OpenAI from "openai";
import { bootstrapEnv } from "./env/startupEnv.js";

bootstrapEnv();

let openai = null;

if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    console.warn("OPENAI_API_KEY is not configured.");
}

const FALLBACK_SYSTEM_PROMPT = `You are a professional customer service assistant on WhatsApp.
Be friendly, helpful, and concise. Never mention webhooks, verification, testing, or platform setup.`;

function buildChatMessages(userText, options = {}) {
    const {
        systemPrompt = "",
        knowledgeContext = "",
        history = [],
        context,
        authoritativeBookingData = false,
    } = options;
    const resolvedKnowledge = knowledgeContext || context || "";
    const systemParts = [(systemPrompt || FALLBACK_SYSTEM_PROMPT).trim()];

    if (authoritativeBookingData) {
        systemParts.push(
            "BOOKING RECAP RULE: Authoritative booking data is injected below. " +
                "Use ONLY those vehicle, date, time, location, and stock fields for your reply. " +
                "Do NOT substitute vehicles or dates from conversation memory."
        );
    }

    if (resolvedKnowledge.trim()) {
        systemParts.push(`Relevant knowledge:\n${resolvedKnowledge.trim()}`);
    }
    const systemContent = systemParts.join("\n\n");

    const chatMessages = [{ role: "system", content: systemContent }];
    for (const turn of history) {
        if (!turn?.content) continue;
        chatMessages.push({
            role: turn.role === "assistant" ? "assistant" : "user",
            content: turn.content,
        });
    }
    chatMessages.push({ role: "user", content: userText });
    return chatMessages;
}

export async function askAI(message, options = {}) {
    const userText = (message || "").trim();
    if (!userText) {
        return "I didn't catch that. Please send a text message.";
    }

    if (!openai) {
        console.error("[openai] OPENAI_API_KEY is not set");
        return "Sorry, I'm not configured to respond right now.";
    }

    const chatMessages = buildChatMessages(userText, options);

    try {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: chatMessages,
            max_tokens: 500,
        });

        const reply = response.choices[0]?.message?.content?.trim();
        if (!reply) {
            console.error("[openai] Empty completion:", JSON.stringify(response));
            return "Sorry, I couldn't generate a reply.";
        }
        return reply;
    } catch (error) {
        console.error("[openai] API error:", error.status || error.code, error.message);
        if (error.response?.data) {
            console.error("[openai] Response:", JSON.stringify(error.response.data));
        }
        return "Sorry, I'm having trouble responding right now.";
    }
}

/**
 * Chat completion with OpenAI tool calling — executes tools and returns final reply.
 * @param {string} message
 * @param {object} options
 * @param {object[]} [options.tools] OpenAI tool definitions
 * @param {(name: string, args: object) => Promise<object>} [options.executeTool]
 * @param {number} [options.maxToolRounds]
 * @returns {Promise<{ reply: string, toolResults: object[] }>}
 */
export async function askAIWithTools(message, options = {}) {
    const userText = (message || "").trim();
    if (!userText) {
        return { reply: "I didn't catch that. Please send a text message.", toolResults: [] };
    }

    if (!openai) {
        console.error("[openai] OPENAI_API_KEY is not set");
        return { reply: "Sorry, I'm not configured to respond right now.", toolResults: [] };
    }

    const {
        tools = [],
        executeTool,
        maxToolRounds = 3,
        authoritativeBookingData = false,
        preloadedBookingResult = null,
    } = options;

    let currentMessages = buildChatMessages(userText, { ...options, authoritativeBookingData });
    const toolResults = [];
    if (preloadedBookingResult?.ok) {
        toolResults.push({ tool: "getCustomerBookings", ...preloadedBookingResult });
    }
    let reply = "";

    try {
        let round = 0;
        while (round < maxToolRounds) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages: currentMessages,
                tools: tools.length ? tools : undefined,
                tool_choice: tools.length ? "auto" : undefined,
                max_tokens: 500,
            });

            const choice = response.choices[0]?.message;
            if (!choice) break;

            if (choice.tool_calls?.length && executeTool) {
                currentMessages.push(choice);

                for (const call of choice.tool_calls) {
                    const fnName = call.function.name;
                    let fnArgs = {};
                    try {
                        fnArgs = JSON.parse(call.function.arguments || "{}");
                    } catch {
                        fnArgs = {};
                    }

                    const result = await executeTool(fnName, fnArgs);
                    toolResults.push(result);

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

        if (!reply && toolResults.length) {
            const skipFallbackMessage = (m) =>
                !m ||
                /^Found \d+ vehicles?\.?$/.test(m) ||
                /^Inventory search returned \d+ vehicle/.test(m);

            const bookingRecap = [...toolResults]
                .reverse()
                .find((r) => r.tool === "getCustomerBookings" && r.ok && r.message);

            if (bookingRecap?.message) {
                reply = bookingRecap.message;
            } else {
                const lastOk = [...toolResults]
                    .reverse()
                    .find(
                        (r) =>
                            (r.ok || r.success) &&
                            r.message &&
                            !skipFallbackMessage(r.message) &&
                            r.tool !== "bookTestDrive"
                    );

                if (lastOk?.message) {
                    reply = lastOk.message;
                } else {
                    const needTime = toolResults.find((r) => r.code === "NEED_TIME");
                    if (needTime?.reason) {
                        reply = needTime.reason;
                    } else {
                        reply = toolResults.map((r) => r.message || r.error).filter(Boolean).join("\n\n");
                    }
                }
            }
        }
        if (!reply) reply = "Sorry, I couldn't generate a reply.";

        return { reply, toolResults };
    } catch (error) {
        console.error("[openai] API error (tools):", error.status || error.code, error.message);
        return { reply: "Sorry, I'm having trouble responding right now.", toolResults };
    }
}