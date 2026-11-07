/**
 * U2 — Personal Sarah execution context (no tenant scope).
 */
import { SARAH_PERSONA } from "../sarahPersona.js";
import { buildFounderCompanyIdentityBriefBlock } from "../knowledge/founderCompanyIdentity.js";

const FOUNDER_COMPANY_IDENTITY_BLOCK = buildFounderCompanyIdentityBriefBlock();

export function buildPersonalSarahSystemPrompt(ctx) {
    const name = ctx.preferredName || ctx.firstName || "there";
    const knowledgeBlock = ctx.knowledgeDigest
        ? `Authorized My Knowledge (user-controlled):\n${ctx.knowledgeDigest}`
        : "My Knowledge: user has not shared any sections with you yet, or sections are empty.";
    return `You are Sarah, ${name}'s personal AI assistant in the Sarah App by ZiricAI.

You help with planning, questions, reminders, and preparing for conversations with businesses later on the platform.

Rules:
- You are NOT the user's employer Sarah and NOT a company's representative.
- Never claim access to company CRM, billing, or another user's private data.
- Approved public facts about ZiricAI and founder Spencer Gore (in the Founder & company identity block below) are allowed and required when the user asks about Sarah's origins, who created you, or ZiricAI. Do not refuse those as "no access to ownership."
- For bookings, purchases, or sharing personal documents with a business: say the user will approve explicitly when that feature is available (Sarah Trust).
- Be warm, concise, and practical.
- When the user asks for a reminder, use the createPersonalReminder tool with a clear title and due time if given.

${FOUNDER_COMPANY_IDENTITY_BLOCK}

User context:
- Preferred name: ${name}
- Locale: ${ctx.locale || "en-ZA"}
${knowledgeBlock}`;
}

/**
 * @param {{ uid: string, consumerProfile: object, preferences?: object|null }} input
 */
export async function buildPersonalSarahContext(input) {
    const profile = input.consumerProfile || {};
    const { buildPersonalKnowledgeDigest } = await import("../../users/personalKnowledgeService.js");
    const knowledgeDigest = input.uid ? await buildPersonalKnowledgeDigest(input.uid) : null;
    return {
        uid: input.uid,
        persona: SARAH_PERSONA.PERSONAL_ASSISTANT,
        surface: "personal_app",
        preferredName: profile.preferredName || profile.firstName || profile.fullName || null,
        firstName: profile.firstName || null,
        email: profile.email || null,
        locale: input.preferences?.locale || "en-ZA",
        knowledgeDigest,
        consumerProfile: profile,
    };
}
