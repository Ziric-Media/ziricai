/**
 * U2 — Personal Sarah chat (isolated from tenant /api/sarah/chat).
 */
import OpenAI from "openai";
import { bootstrapEnv } from "../../env/startupEnv.js";
import { buildPersonalSarahContext, buildPersonalSarahSystemPrompt } from "./personalSarahContext.js";
import {
    buildFounderCompanyIdentityFullReferenceBlock,
    userExplicitlyAsksFounderDetail,
} from "../knowledge/founderCompanyIdentity.js";
import {
    getOrCreatePersonalSarahSession,
    getPersonalSarahSessionHistory,
    appendPersonalSarahMessage,
    recordPersonalSarahAction,
} from "./personalSarahSessionStore.js";
import { PERSONAL_SARAH_TOOL_DEFINITIONS, executePersonalSarahTool } from "./personalSarahTools.js";

bootstrapEnv();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function matchDemoPersonalIntent(message) {
    const lower = message.toLowerCase();
    if (/\bsummarize\b.*\b(smilemore|chat|conversation)\b/.test(lower)) {
        return {
            tool: "summarizeCompanyConversation",
            args: { companyId: "smilemore-demo" },
        };
    }
    if (/\bremind\b|\breminder\b|\bremember to\b/.test(lower)) {
        const titleMatch = message.match(/remind(?: me)?(?: to)?\s+(.+)/i);
        return {
            tool: "createPersonalReminder",
            args: { title: (titleMatch?.[1] || "Reminder").slice(0, 120) },
        };
    }
    return null;
}

async function runPersonalDemoMode(ctx, message, session) {
    const intent = matchDemoPersonalIntent(message);
    if (intent) {
        const result = await executePersonalSarahTool(intent.tool, ctx, intent.args);
        await recordPersonalSarahAction(session, { tool: intent.tool, success: result.success });
        const reply = result.message || result.error || "Done.";
        await appendPersonalSarahMessage(session, "user", message);
        await appendPersonalSarahMessage(session, "assistant", reply);
        return { reply, sessionId: session.id, actions: [result], mode: "demo" };
    }

    const name = ctx.preferredName || "there";
    const reply = `Hi ${name}! I'm your personal Sarah (demo mode — add OPENAI_API_KEY for full replies). Ask me to set a reminder, plan your week, or prepare for finding a business on Discover soon.`;
    await appendPersonalSarahMessage(session, "user", message);
    await appendPersonalSarahMessage(session, "assistant", reply);
    return { reply, sessionId: session.id, actions: [], mode: "demo" };
}

/**
 * @param {{ uid: string, consumerProfile: object, preferences?: object|null }} auth
 * @param {{ message: string, sessionId?: string|null }} input
 */
export async function handlePersonalSarahChat(auth, input) {
    const message = String(input.message || "").trim();
    if (!message) {
        return { reply: "Say something and I'll help.", sessionId: input.sessionId || null, actions: [] };
    }

    const ctx = await buildPersonalSarahContext(auth);
    const session = await getOrCreatePersonalSarahSession({
        sessionId: input.sessionId || null,
        userId: ctx.uid,
        createIfMissing: true,
    });

    if (!openai) {
        return runPersonalDemoMode(ctx, message, session);
    }

    const history = getPersonalSarahSessionHistory(session);
    let systemPrompt = buildPersonalSarahSystemPrompt(ctx);
    if (userExplicitlyAsksFounderDetail(message)) {
        systemPrompt += `\n\n${buildFounderCompanyIdentityFullReferenceBlock()}`;
    }
    const messages = [{ role: "system", content: systemPrompt }];
    for (const turn of history) {
        messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content });
    }
    messages.push({ role: "user", content: message });

    const actions = [];
    let reply = "";
    let round = 0;
    let currentMessages = [...messages];

    while (round < 3) {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: currentMessages,
            tools: PERSONAL_SARAH_TOOL_DEFINITIONS,
            tool_choice: "auto",
            max_tokens: 700,
        });

        const choice = response.choices[0]?.message;
        if (!choice) break;

        if (choice.tool_calls?.length) {
            currentMessages.push(choice);
            for (const call of choice.tool_calls) {
                let fnArgs = {};
                try {
                    fnArgs = JSON.parse(call.function.arguments || "{}");
                } catch {
                    fnArgs = {};
                }
                const result = await executePersonalSarahTool(call.function.name, ctx, fnArgs);
                actions.push(result);
                await recordPersonalSarahAction(session, { tool: call.function.name, success: result.success });
                currentMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: JSON.stringify(result),
                });
            }
            round += 1;
            continue;
        }

        reply = (choice.content || "").trim();
        break;
    }

    if (!reply) {
        reply = "I'm here — could you rephrase that?";
    }

    await appendPersonalSarahMessage(session, "user", message);
    await appendPersonalSarahMessage(session, "assistant", reply);

    return {
        reply,
        sessionId: session.id,
        actions,
        mode: "openai",
    };
}
