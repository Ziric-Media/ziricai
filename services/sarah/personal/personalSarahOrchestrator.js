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
    persistPersonalSarahSession,
} from "./personalSarahSessionStore.js";
import { PERSONAL_SARAH_TOOL_DEFINITIONS, executePersonalSarahTool, resolveReminderDueAt } from "./personalSarahTools.js";
import { maybeCompleteSarahWorkTask } from "./personalSarahWorkCompletion.js";
import { buildRecommendationsUiFromActions } from "./personalSarahRecommendationsUi.js";

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
        const rawTitle = (titleMatch?.[1] || "Reminder").trim().slice(0, 120);
        const dueAt = resolveReminderDueAt(null, { userMessage: message, title: rawTitle });
        return {
            tool: "createPersonalReminder",
            args: { title: rawTitle, dueAt },
        };
    }
    return null;
}

async function runPersonalDemoMode(ctx, message, session) {
    const intent = matchDemoPersonalIntent(message);
    if (intent) {
        const result = await executePersonalSarahTool(intent.tool, ctx, intent.args, {
            userMessage: message,
            sessionId: session?.id,
        });
        await recordPersonalSarahAction(session, { tool: intent.tool, success: result.success });
        const reply = result.message || result.error || "Done.";
    await appendPersonalSarahMessage(session, "user", message, { attachments: [] });
    await appendPersonalSarahMessage(session, "assistant", reply);
    let workCompleted = false;
    if (session.mode === "work" && !session.workSubmittedAt) {
        const done = await maybeCompleteSarahWorkTask(session, { userMessage: message, assistantReply: reply });
        if (done.completed) {
            workCompleted = true;
            await persistPersonalSarahSession(session);
        }
    }
    return {
        reply,
        sessionId: session.id,
        actions: [result],
        mode: "demo",
        workCompleted,
        sessionSurface: session.mode === "work" ? "work" : "chat",
        metering: { archetype: intent.tool === "createPersonalReminder" ? "CHAT-TOOL" : "DEMO" },
    };
    }

    const name = ctx.preferredName || "there";
    const reply = `Hi ${name}! I'm your personal Sarah (demo mode — add OPENAI_API_KEY for full replies). Ask me to set a reminder, plan your week, or prepare for finding a business on Discover soon.`;
    await appendPersonalSarahMessage(session, "user", message, { attachments: [] });
    await appendPersonalSarahMessage(session, "assistant", reply);
    let workCompleted = false;
    if (session.mode === "work" && !session.workSubmittedAt) {
        const done = await maybeCompleteSarahWorkTask(session, { userMessage: message, assistantReply: reply });
        if (done.completed) {
            workCompleted = true;
            await persistPersonalSarahSession(session);
        }
    }
    return {
        reply,
        sessionId: session.id,
        actions: [],
        mode: "demo",
        workCompleted,
        sessionSurface: session.mode === "work" ? "work" : "chat",
        metering: { archetype: "DEMO" },
    };
}

/**
 * @param {{ uid: string, consumerProfile: object, preferences?: object|null }} auth
 * @param {{ message: string, sessionId?: string|null }} input
 */
export async function handlePersonalSarahChat(auth, input) {
    const message = String(input.message || "").trim();
    const displayMessage = String(input.displayMessage ?? message).trim();
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
        return runPersonalDemoMode(ctx, displayMessage || message, session);
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
    const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
    let meteringInputTokens = 0;
    let meteringOutputTokens = 0;
    let meteringToolRounds = 0;

    while (round < 5) {
        const response = await openai.chat.completions.create({
            model: modelId,
            messages: currentMessages,
            tools: PERSONAL_SARAH_TOOL_DEFINITIONS,
            tool_choice: "auto",
            max_tokens: 700,
        });

        const usage = response.usage;
        if (usage) {
            meteringInputTokens += Number(usage.prompt_tokens) || 0;
            meteringOutputTokens += Number(usage.completion_tokens) || 0;
        }

        const choice = response.choices[0]?.message;
        if (!choice) break;

        if (choice.tool_calls?.length) {
            meteringToolRounds += choice.tool_calls.length;
            currentMessages.push(choice);
            for (const call of choice.tool_calls) {
                let fnArgs = {};
                try {
                    fnArgs = JSON.parse(call.function.arguments || "{}");
                } catch {
                    fnArgs = {};
                }
                const result = await executePersonalSarahTool(call.function.name, ctx, fnArgs, {
                    userMessage: message,
                    sessionId: session?.id,
                });
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

    await appendPersonalSarahMessage(session, "user", displayMessage || message, {
        attachments: input.attachments || [],
    });
    await appendPersonalSarahMessage(session, "assistant", reply);

    let workCompleted = false;
    if (session.mode === "work" && !session.workSubmittedAt) {
        const done = await maybeCompleteSarahWorkTask(session, { userMessage: message, assistantReply: reply });
        if (done.completed) {
            workCompleted = true;
            await persistPersonalSarahSession(session);
        }
    }

    return {
        reply,
        sessionId: session.id,
        actions,
        recommendationsUi: buildRecommendationsUiFromActions(actions),
        mode: "openai",
        workCompleted,
        sessionSurface: session.mode === "work" ? "work" : "chat",
        metering: {
            inputTokens: meteringInputTokens,
            outputTokens: meteringOutputTokens,
            toolRounds: meteringToolRounds,
            model: modelId,
        },
    };
}
