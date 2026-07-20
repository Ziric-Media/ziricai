/**
 * ZiricAI platform FAQ — single source of truth for Sarah (portal + landing).
 * Server imports via services/sarah/platformKnowledge.js re-export.
 * Pricing copy is derived from services/platform/billingPlans.js.
 */
import { getPricingSummaryText, getDefaultPlatformReply } from "./billingPlans.js";

export const PLATFORM_FAQ = {
    overview: {
        title: "How ZiricAI works",
        keywords: ["how does ziricai work", "what is ziricai", "how it works", "platform", "explain"],
        answer:
            "ZiricAI is an AI operating platform for businesses. You deploy AI Employees (like Reception, Sales, or Support) that answer customers on WhatsApp, web chat, and social — 24/7. Sarah is your in-portal AI assistant who helps you set up employees, upload knowledge, connect channels, and run the business. Typical flow: create account → pick an industry pack → connect WhatsApp → upload FAQs/policies → AI handles enquiries instantly.",
    },
    aiEmployee: {
        title: "What is an AI Employee",
        keywords: ["ai employee", "ai agent", "reception ai", "what is an ai", "employee"],
        answer:
            "An AI Employee is a dedicated AI agent with its own name, role (Sales, Reception, Support, etc.), system prompt, and linked Knowledge Base. Each employee answers on assigned channels using only your uploaded content — no hallucinated pricing or policies. You can run multiple employees for different departments.",
    },
    pricing: {
        title: "Pricing",
        keywords: ["price", "pricing", "cost", "plan", "subscription", "r999", "r999.99", "r2999", "r4999", "custom", "how much", "trial"],
        answer: null,
    },
    setup: {
        title: "Setup & onboarding",
        keywords: ["setup", "onboard", "onboarding", "install", "start", "launch", "minutes", "get started"],
        answer:
            "Go live in under 10 minutes: (1) Create your company account, (2) Choose an industry pack from the Marketplace, (3) Connect WhatsApp via Settings → Channels (QR scan), (4) Upload FAQs, policies, and product docs to Knowledge Base, (5) Activate your default AI Employee. Sarah can walk you through each step inside the portal.",
    },
    whatsapp: {
        title: "WhatsApp integration",
        keywords: ["whatsapp", "meta", "business api", "qr", "channel"],
        answer:
            "WhatsApp connects via Meta Business API. In onboarding or Settings → Integrations, scan the QR or paste Phone Number ID + token. Inbound messages route to your default AI Employee, which replies using its Knowledge Base. Outbound replies are sent back through the same WhatsApp number.",
    },
    marketplace: {
        title: "Marketplace & industry packs",
        keywords: ["marketplace", "industry", "pack", "automotive", "school", "legal", "healthcare", "funeral", "retail", "church"],
        answer:
            "The Marketplace offers 50+ industry packs — automotive, schools, legal, healthcare, funeral, retail, church, and more. Each pack installs a pre-trained AI Employee, knowledge templates, workflows, and CRM stages. Install takes about 4 minutes; customize branding and add your own documents afterward.",
    },
    integrations: {
        title: "Integrations",
        keywords: ["integration", "facebook", "instagram", "telegram", "email", "sms", "calendar", "stripe", "paystack"],
        answer:
            "Channels: WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS — unified in one inbox. Connectors include Google Calendar, Microsoft 365, Stripe, and Paystack for appointments and payments. Sarah can start channel connection wizards from chat.",
    },
    crm: {
        title: "CRM",
        keywords: ["crm", "customer", "lead", "contact", "pipeline"],
        answer:
            "Built-in CRM captures every conversation as a customer profile with timeline, notes, tasks, and lead scores. AI automatically tags intent and sentiment. Search CRM from Sarah or the Customers module. WhatsApp enquiries create or update profiles automatically.",
    },
    automation: {
        title: "Automation",
        keywords: ["automation", "workflow", "trigger", "auto"],
        answer:
            "Automation Builder lets you create workflows: triggers (new message, keyword, lead score) → conditions → AI actions → CRM updates → notifications. Industry packs include starter workflows. Sarah can create simple automations or open the builder for you.",
    },
    knowledge: {
        title: "Knowledge Base",
        keywords: ["knowledge", "faq", "document", "upload", "train", "rag", "pdf"],
        answer:
            "Knowledge Base stores FAQs, policies, product sheets, and manuals (PDF, TXT, DOCX). Each AI Employee links to a KB — answers come from your content only. Upload via Knowledge module or tell Sarah to add content. Marketplace packs seed starter docs on install.",
    },
    sarah: {
        title: "Sarah — AI Operating Assistant",
        keywords: ["sarah", "assistant", "operating", "help me"],
        answer:
            "I'm Sarah — your AI Operating Assistant inside the Company Portal. I can view analytics, search CRM, create AI employees, upload knowledge, connect WhatsApp, manage team invites, and navigate you to the right module. Ask me anything about ZiricAI or tell me what you want to do.",
    },
    security: {
        title: "Security & compliance",
        keywords: ["security", "popia", "gdpr", "encrypt", "data", "safe", "secure", "privacy"],
        answer:
            "Data is encrypted in transit (TLS 1.3) and at rest (AES-256) on Google Firebase. Each tenant is fully isolated with role-based access, audit logs, and POPIA/GDPR-ready consent tools. Knowledge and conversations never leak across companies.",
    },
};

function resolveFaqAnswer(id, entry) {
    if (id === "pricing") return getPricingSummaryText();
    return entry.answer;
}

/** Ordered intent list for keyword matching (most specific first). */
export const PLATFORM_INTENTS = Object.entries(PLATFORM_FAQ).map(([id, entry]) => ({
    id,
    keys: entry.keywords,
    reply: resolveFaqAnswer(id, entry),
    title: entry.title,
}));

export const PLATFORM_DEFAULT_REPLY = getDefaultPlatformReply();

/**
 * Match user text to the best FAQ topic.
 * @param {string} text
 * @returns {{ id: string, answer: string, title: string } | null}
 */
export function matchPlatformQuestion(text) {
    const lower = String(text || "").toLowerCase().trim();
    if (!lower) return null;

    for (const [id, entry] of Object.entries(PLATFORM_FAQ)) {
        if (entry.keywords.some((k) => lower.includes(k))) {
            return { id, answer: resolveFaqAnswer(id, entry), title: entry.title };
        }
    }
    return null;
}

/**
 * Get answer for a topic id or free-text question.
 * @param {string} [topicOrQuestion]
 */
export function getPlatformAnswer(topicOrQuestion = "general") {
    const topic = String(topicOrQuestion || "").toLowerCase();
    if (PLATFORM_FAQ[topic]) {
        return {
            id: topic,
            answer: resolveFaqAnswer(topic, PLATFORM_FAQ[topic]),
            title: PLATFORM_FAQ[topic].title,
        };
    }
    const matched = matchPlatformQuestion(topicOrQuestion);
    if (matched) return matched;
    if (topic === "general" || !topic) {
        return { id: "general", answer: PLATFORM_DEFAULT_REPLY, title: "ZiricAI" };
    }
    return { id: "general", answer: PLATFORM_DEFAULT_REPLY, title: "ZiricAI" };
}

/** Compact summary for Sarah system prompt injection. */
export function getPlatformKnowledgeSummary() {
    return Object.entries(PLATFORM_FAQ)
        .map(([id, entry]) => {
            const answer = resolveFaqAnswer(id, entry);
            return `• ${entry.title}: ${answer.slice(0, 120)}…`;
        })
        .join("\n");
}
