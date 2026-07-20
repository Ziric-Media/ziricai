import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are ZiricAI, the AI assistant for Ziric Media. You are intelligent, friendly and professional. Always answer politely. Keep replies concise unless the user asks for detail.`;

export async function askAI(message, options = {}) {
    const userText = (message || "").trim();
    if (!userText) {
        return "I didn't catch that. Please send a text message.";
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error("[openai] OPENAI_API_KEY is not set");
        return "Sorry, I'm not configured to respond right now.";
    }

    const { context = "", history = [] } = options;
    const systemContent = context
        ? `${SYSTEM_PROMPT}\n\nRelevant knowledge:\n${context}`
        : SYSTEM_PROMPT;

    const chatMessages = [{ role: "system", content: systemContent }];
    for (const turn of history) {
        if (!turn?.content) continue;
        chatMessages.push({
            role: turn.role === "assistant" ? "assistant" : "user",
            content: turn.content,
        });
    }
    chatMessages.push({ role: "user", content: userText });

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