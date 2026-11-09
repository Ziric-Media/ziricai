/**
 * Dispatch Sarah Network enquiry to Company Sarah (read-only reception).
 */
import OpenAI from "openai";
import { bootstrapEnv } from "../../env/startupEnv.js";
import { buildCompanyReceptionContext } from "./companyReceptionContext.js";
import { handleSarahChat } from "../sarahOrchestrator.js";

bootstrapEnv();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * @param {object} requestDoc — network request envelope
 */
export async function dispatchCompanyReception(requestDoc) {
    const companyId = requestDoc.destination?.companyId;
    const uid = requestDoc.source?.userId;
    const naturalLanguage =
        requestDoc.payload?.naturalLanguage ||
        requestDoc.payload?.intent ||
        "The customer has a general enquiry.";

    const ctx = await buildCompanyReceptionContext(companyId, uid, {
        enquiry: requestDoc.payload,
        consumerDisplayName: requestDoc.payload?.consumerDisplayName,
    });

    const prompt =
        `[Sarah Network consumer enquiry — answer as the company's reception Sarah. ` +
        `Do not expose internal operator tools or unrelated tenant data.]\n\n` +
        `Customer question: ${naturalLanguage}`;

    if (openai) {
        const result = await handleSarahChat(ctx, { message: prompt, sessionId: null });
        return {
            status: "completed",
            payload: {
                naturalLanguage: result.reply,
                structured: {
                    mode: result.mode || "openai",
                    sessionId: result.sessionId,
                },
            },
            policy: {
                notAdvice: true,
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
        };
    }

    const digest = ctx.kbSummary?.digest || "";
    const fallback =
        digest.length > 80
            ? `Thanks for your enquiry. Here's what we can share from our public information:\n\n${digest.slice(0, 900)}`
            : `Thanks for contacting ${ctx.companyName}. We've received your enquiry: “${naturalLanguage.slice(0, 200)}”. ` +
              `A team member will follow up. For immediate help, visit our profile on Discover or start a chat.`;

    return {
        status: "completed",
        payload: {
            naturalLanguage: fallback,
            structured: { mode: "demo", documentCount: ctx.kbSummary?.documentCount || 0 },
        },
        policy: {
            notAdvice: true,
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
    };
}
