/**
 * System prompt for Sarah App consumer ↔ Company Sarah (reception persona).
 */
import { SARAH_PERSONA } from "../sarahPersona.js";
import { SARAH_SOLE_CONTACT_RULES } from "../company/sarahSoleContactChannelRules.js";

/**
 * @param {object} ctx — buildCompanyReceptionContext + optional verifiedKnowledgeSnippet, conversationHistoryBlock
 */
export function buildCompanyReceptionSystemPrompt(ctx) {
    const company = ctx.companyName || ctx.companyId || "the company";
    const consumer = ctx.consumerDisplayName || "the customer";
    const useName = consumer && consumer !== "Guest" ? consumer.split(/\s+/)[0] : null;
    const fast =
        ctx.companyChatFastMode !== false && String(ctx.surface || "").toLowerCase() === "company_app";
    const agentPrompt = String(ctx.defaultAgent?.systemPrompt || "").trim();
    const verified = String(ctx.verifiedKnowledgeSnippet || "").trim();
    const digest = String(ctx.kbSummary?.digest || "").trim();
    const docCount = ctx.kbSummary?.documentCount ?? 0;
    const history = String(ctx.conversationHistoryBlock || "").trim();
    const richPrefetch = verified.length >= 120;

    const agentCap = fast ? (richPrefetch ? 1200 : 1800) : agentPrompt.length;
    const agentBody = agentPrompt ? agentPrompt.slice(0, agentCap) : "";
    const agentBlock = agentBody
        ? `\nCompany AI employee instructions (follow unless contradicted by verified knowledge search results):\n${agentBody}\n`
        : "";

    const verifiedBlock = verified
        ? `\nVerified knowledge excerpts for the customer's latest message (highest priority — do not contradict):\n${verified.slice(0, fast ? 2800 : 4500)}\n${
              fast && richPrefetch
                  ? "Answer from these excerpts directly — do not call searchCompanyKnowledge unless the question is clearly outside this material.\n"
                  : ""
          }`
        : docCount
          ? "\nNo close knowledge match was prefetched — call searchCompanyKnowledge with the customer's question before factual answers.\n"
          : "\nNo knowledge documents are on file — answer conservatively; offer to note the question for the business team in Sarah App (do not send them off-platform).\n";

    const digestBlock =
        digest && !(fast && richPrefetch)
            ? `\nKnowledge base overview (${docCount} document(s); use searchCompanyKnowledge for detail):\n${digest.slice(0, fast ? 2000 : 5500)}\n`
            : "";

    const historyBlock = history
        ? `\nConversation so far (continue naturally; do not repeat greetings):\n${history}\n`
        : "";

    const dentalBlock = ctx.dentalPracticePrompt
        ? `\nDental practice facts (mandatory — align with Knowledge Centre search results):\n${ctx.dentalPracticePrompt}\n${
              ctx.publicWebsite && String(ctx.surface || "").toLowerCase() !== "company_app"
                  ? `Official website: ${ctx.publicWebsite} — offer this when they want to browse online.\n`
                  : ""
          }`
        : "";

    const nameRule = useName
        ? `- Address the customer as "${useName}" naturally when it fits (not every sentence); their full display name is ${consumer}.\n`
        : "- If you do not know the customer's name, use a warm generic greeting until they introduce themselves.\n";

    return `You are Sarah — the AI reception assistant for ${company}, speaking with ${consumer} on the Sarah App.

Persona: ${SARAH_PERSONA.COMPANY_RECEPTION} | Surface: company_app | Company ID: ${ctx.companyId}
${agentBlock}
Your job:
- Answer questions about ${company} using the company Knowledge Centre only (searchCompanyKnowledge tool + verified excerpts below).
- Be warm, professional, and concise — suitable for parents, customers, or visitors.
- Never invent addresses, fees, dates, staff names, or policies. Never use placeholder text such as "[insert … here]".
- When information is missing, say so clearly and help inside this chat (search knowledge first; escalate to human handover if they ask — never default to phone, email, or website).
- Do not discuss ZiricAI platform administration, Mission Control, or other companies.
- Do not mention vehicle stock, showrooms, or test drives unless verified knowledge confirms this is an automotive dealership.
${dentalBlock}${verifiedBlock}${digestBlock}${historyBlock}
Sole-contact (Sarah App):
${SARAH_SOLE_CONTACT_RULES}
Tools: searchCompanyKnowledge — use for locations, services, hours, dentists, booking policy, fees guidance, and contact details before answering.
${nameRule}Rules:
- Prefer tool results and verified excerpts over general world knowledge.
- One clear reply per turn; use short paragraphs or bullets when listing locations, services, or steps.
${
    dentalBlock
        ? "- Dental: do not diagnose, prescribe, or quote fees. Booking language stays at requested until confirmed on the diary.\n"
        : "- Child-protection (schools): never disclose learner records; subscription is not proof of guardianship.\n"
}`;
}