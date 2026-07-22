/**
 * ZiricAI platform FAQ — single source of truth for Sarah (portal + landing).
 * Server imports via services/sarah/platformKnowledge.js re-export.
 * Pricing copy is derived from services/platform/billingPlans.js.
 */
import { getPricingSummaryText, getDefaultPlatformReply } from "./billingPlans.js";

export const PLATFORM_FAQ = {
    overview: {
        title: "What is ZiricAI",
        keywords: [
            "what is ziricai",
            "what does ziricai do",
            "tell me about ziricai",
            "explain ziricai",
            "how does ziricai work",
            "what is this",
            "about ziricai",
            "ziricai platform",
        ],
        answer:
            "ZiricAI is a platform that gives your business AI employees — like a receptionist, sales agent, or support rep — that answer customers on WhatsApp, web chat, and social media, 24/7. You upload your FAQs and policies, connect your channels, and the AI handles enquiries instantly using only your content. Most businesses are live in under 10 minutes.",
    },
    pricing: {
        title: "Pricing",
        keywords: [
            "how much",
            "how much does it cost",
            "how much does ziricai cost",
            "price",
            "pricing",
            "cost",
            "subscription",
            "monthly fee",
            "pay",
            "afford",
            "r999",
            "r999.99",
            "r2999",
            "r4999",
            "plans",
            "tier",
        ],
        answer: null,
    },
    trial: {
        title: "Free trial",
        keywords: [
            "free trial",
            "14 day",
            "14-day",
            "try free",
            "try it",
            "no credit card",
            "demo account",
            "can i try",
            "test it out",
        ],
        answer:
            "Yes — every plan includes a 14-day free trial with full access, and no credit card is required. Click \"Start Free Trial\" anywhere on this page, pick your industry pack, and you'll have an AI employee answering enquiries within minutes.",
    },
    setup: {
        title: "Setup & onboarding",
        keywords: [
            "setup",
            "set up",
            "onboard",
            "onboarding",
            "install",
            "get started",
            "how long",
            "how fast",
            "launch",
            "go live",
            "minutes to setup",
        ],
        answer:
            "Most businesses go live in under 10 minutes. Create your account, choose an industry pack from the Marketplace, connect WhatsApp with a quick QR scan, upload your FAQs and policies, and activate your AI employee — no developers needed. Sarah can walk you through each step inside the Company Portal once you're signed up.",
    },
    whatsapp: {
        title: "WhatsApp integration",
        keywords: [
            "whatsapp",
            "does it work with whatsapp",
            "whatsapp integration",
            "meta business",
            "business api",
            "qr code",
            "qr scan",
        ],
        answer:
            "Yes — WhatsApp is one of our core channels. Connect via Meta Business API during onboarding or in Settings → Integrations (QR scan or Phone Number ID). Incoming messages route to your AI employee, which replies using your Knowledge Base, and responses go back through your WhatsApp number automatically.",
    },
    restaurant: {
        title: "Restaurant & hospitality",
        keywords: [
            "restaurant",
            "my restaurant",
            "cafe",
            "café",
            "food business",
            "dining",
            "menu questions",
            "table booking",
            "table reservation",
            "hospitality",
            "hotel",
            "bar",
            "takeaway",
        ],
        answer:
            "Absolutely — ZiricAI works great for restaurants and hospitality businesses. Our Restaurant AI pack handles table reservations, menu questions, dietary requests, and general guest enquiries on WhatsApp and web chat. Install it from the Marketplace, add your menu and booking policies, and you can be live in minutes.",
    },
    marketplace: {
        title: "Marketplace & industry packs",
        keywords: [
            "marketplace",
            "industry pack",
            "industry packs",
            "which industries",
            "what industries",
            "automotive",
            "school",
            "legal",
            "healthcare",
            "funeral",
            "retail",
            "church",
            "car dealer",
            "dealership",
        ],
        answer:
            "We offer 50+ industry packs in the Marketplace — automotive, schools, legal, healthcare, funeral, retail, church, restaurants, and more. Each pack installs a pre-trained AI employee with knowledge templates, workflows, and CRM stages tailored to that industry. Installation takes about 4 minutes; you can customize branding and add your own documents afterward.",
    },
    aiEmployee: {
        title: "What is an AI Employee",
        keywords: [
            "ai employee",
            "ai employees",
            "ai agent",
            "ai agents",
            "reception ai",
            "what is an ai employee",
            "virtual employee",
            "digital employee",
        ],
        answer:
            "An AI Employee is a dedicated AI agent with its own name, role (Reception, Sales, Support, and more), and linked Knowledge Base. It answers on your assigned channels using only your uploaded content — so pricing and policies stay accurate. You can run multiple AI employees for different departments at the same time.",
    },
    integrations: {
        title: "Integrations & channels",
        keywords: [
            "integration",
            "integrations",
            "facebook",
            "instagram",
            "telegram",
            "email channel",
            "sms",
            "google calendar",
            "microsoft 365",
            "stripe",
            "paystack",
            "social media",
            "web chat",
            "live chat",
            "channels",
        ],
        answer:
            "ZiricAI connects to WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS — all in one unified inbox. For appointments and payments, we integrate with Google Calendar, Microsoft 365, Stripe, and Paystack. Sarah can start channel connection wizards from inside the portal.",
    },
    crm: {
        title: "CRM",
        keywords: [
            "crm",
            "customer management",
            "lead capture",
            "lead scoring",
            "contact management",
            "sales pipeline",
            "customer profile",
        ],
        answer:
            "Every conversation is captured in a built-in CRM with customer profiles, timelines, notes, tasks, and lead scores. AI automatically tags intent and sentiment, and WhatsApp enquiries create or update profiles automatically — so no lead slips through the cracks.",
    },
    automation: {
        title: "Automation",
        keywords: [
            "automation",
            "workflow",
            "workflows",
            "trigger",
            "automate",
            "auto reply",
        ],
        answer:
            "The Automation Builder lets you create workflows — for example, a new WhatsApp message triggers a condition, then an AI action, a CRM update, and a team notification. Industry packs include starter workflows, and Sarah can create simple automations or open the builder for you.",
    },
    knowledge: {
        title: "Knowledge Base",
        keywords: [
            "knowledge base",
            "knowledge",
            "upload documents",
            "upload faq",
            "train ai",
            "train the ai",
            "rag",
            "pdf upload",
            "document upload",
        ],
        answer:
            "The Knowledge Base stores your FAQs, policies, product sheets, and manuals (PDF, TXT, DOCX). Each AI Employee links to a Knowledge Base, so answers come from your content only — not generic AI guesses. Upload via the Knowledge module or ask Sarah to add content. Marketplace packs seed starter documents on install.",
    },
    sarah: {
        title: "Sarah — AI assistant",
        keywords: [
            "who is sarah",
            "what is sarah",
            "tell me about sarah",
            "sarah assistant",
            "sarah ai",
        ],
        answer:
            "I'm Sarah — a Reception AI built on ZiricAI. Right here on the landing page I answer your questions about the platform. Once you sign up, I also help you inside the Company Portal — setting up AI employees, connecting WhatsApp, uploading knowledge, and running your business. Your customer-facing AI employees answer enquiries 24/7, book appointments, capture leads, and send quotes in under 2 seconds.",
    },
    security: {
        title: "Security & compliance",
        keywords: [
            "security",
            "secure",
            "safe",
            "data protection",
            "popia",
            "gdpr",
            "encrypted",
            "encryption",
            "privacy",
            "data privacy",
            "is my data safe",
        ],
        answer:
            "Your data is protected with TLS 1.3 encryption in transit and AES-256 encryption at rest on Google Firebase. Each company's data is fully isolated with role-based access, audit logs, and POPIA/GDPR-ready consent tools. Knowledge and conversations never leak across companies.",
    },
    support: {
        title: "Support & contact",
        keywords: [
            "support",
            "offer support",
            "any support",
            "do you offer support",
            "customer support",
            "help",
            "need help",
            "get help",
            "customer service",
            "contact",
            "contact us",
            "assistance",
            "technical support",
            "human help",
            "speak to someone",
            "talk to a human",
            "help desk",
            "get in touch",
            "contact team",
            "email support",
            "live chat",
            "reach you",
            "reach your team",
        ],
        answer:
            "Yes — we offer full support by email and live chat (see the Contact section on this page), and I'm here to help you right now. During your free trial and beyond, you get onboarding assistance, setup walkthroughs with Sarah in the Company Portal, and friendly help from our team whenever you need it.",
    },
    roi: {
        title: "ROI & business value",
        keywords: [
            "roi",
            "return on investment",
            "save money",
            "revenue",
            "after hours",
            "missed leads",
            "missed enquiries",
            "worth it",
            "business value",
        ],
        answer:
            "Most businesses lose 30–40% of after-hours enquiries because nobody is available to reply. With an AI employee handling them instantly, customers like Central Motors saw a 42% increase in after-hours lead conversion. Scroll down to our ROI calculator on this page to estimate your numbers.",
    },
};

export const PLATFORM_UNCLEAR_REPLY =
    "I want to make sure I help you properly — could you rephrase that? I can answer questions about what ZiricAI is, pricing, setup, support, industries (including restaurants), WhatsApp integration, security, the free trial, and more.";

/** Question openers that signal a yes/no or availability question. */
const QUESTION_OPENER_PATTERNS = [
    /do you (offer|have|provide|give)/,
    /can i get/,
    /is there/,
    /are there/,
    /do i get/,
    /does ziricai (offer|have|provide)/,
];

/** Single-word or phrase hints for fallback matching when keyword score is low. */
const TOPIC_INTENT_HINTS = {
    support: [
        "support",
        "customer service",
        "customer support",
        "technical support",
        "help desk",
        "human help",
        "get in touch",
        "contact us",
        "live chat",
        "email support",
        "assistance",
        "contact",
        "help",
    ],
    pricing: ["how much", "pricing", "price", "cost", "subscription", "monthly fee", "afford", "pay"],
    overview: ["what is ziricai", "what is this", "tell me about ziricai", "about ziricai"],
    setup: ["set up", "setup", "onboarding", "onboard", "get started", "go live", "install"],
    trial: ["free trial", "14 day", "14-day", "try free", "no credit card", "demo account"],
    whatsapp: ["whatsapp"],
    restaurant: ["restaurant", "cafe", "café", "hospitality", "food business"],
    security: ["security", "data protection", "popia", "gdpr", "privacy", "encrypted"],
};

const FOLLOW_UP_PATTERNS = [
    "tell me more",
    "more info",
    "more detail",
    "go on",
    "what else",
    "and what about",
    "can you elaborate",
    "explain more",
    "anything else about",
    "keep going",
];

/** Normalize user input for matching. */
export function normalizeQuestionText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s?]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score how well a keyword matches normalized user text. */
export function scoreKeywordMatch(normalized, keyword) {
    const kw = String(keyword || "").toLowerCase().trim();
    if (!kw || !normalized) return 0;

    if (normalized === kw) return 120 + kw.length * 2;

    if (normalized.includes(kw)) {
        let score = 55 + kw.length * 2;
        if (kw.includes(" ")) return score + 15;

        const wordRe = new RegExp(`\\b${escapeRegExp(kw)}\\b`);
        if (wordRe.test(normalized)) return score + 12;

        if (kw.length <= 3) return score * 0.35;
        return score;
    }

    return 0;
}

function resolveFaqAnswer(id, entry) {
    if (id === "pricing") return getPricingSummaryText();
    return entry.answer;
}

function conversationalPricingAnswer(summary) {
    if (!summary) return getPricingSummaryText();
    return summary.replace(/^Plans:\s*/, "We offer ");
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
 * Optional opener so replies feel like they answer the question asked.
 * @param {string} id
 * @param {string} answer
 * @param {string} question
 */
export function formatReplyForQuestion(id, answer, question) {
    const normalized = normalizeQuestionText(question);
    if (!answer) return PLATFORM_DEFAULT_REPLY;

    if (id === "pricing") {
        const body = conversationalPricingAnswer(answer);
        if (/how much|cost|price|pricing|pay|afford|expensive|cheap/.test(normalized)) {
            return `Great question! ${body}`;
        }
        return body;
    }

    if (id === "restaurant" && /can it work|will it work|good for|suitable|my restaurant/.test(normalized)) {
        return answer;
    }

    if (id === "trial" && /free|trial|try|demo|credit card/.test(normalized)) {
        return answer;
    }

    if (id === "whatsapp" && /work with|integrate|connect|whatsapp/.test(normalized)) {
        return answer.startsWith("Yes") ? answer : `Yes — ${answer.charAt(0).toLowerCase()}${answer.slice(1)}`;
    }

    if (id === "support" && /support|help|contact|assistance|customer service|human|reach/.test(normalized)) {
        return answer;
    }

    if (id === "setup" && /help|someone|assist|walk me|set up|setup/.test(normalized)) {
        return /^(yes|absolutely)/i.test(answer)
            ? answer
            : `Yes — we offer onboarding assistance. ${answer}`;
    }

    if (id === "overview" && /what is|tell me about|explain|about ziricai/.test(normalized)) {
        return answer;
    }

    if (id === "trial" && /offer|have|include/.test(normalized) && !/support|help desk|customer service/.test(normalized)) {
        return answer;
    }

    return answer;
}

function hasQuestionOpener(normalized) {
    return QUESTION_OPENER_PATTERNS.some((p) => p.test(normalized));
}

/** Boost score when question openers combine with topic intent words. */
function scoreTopicIntentBoost(normalized, topicId) {
    const hints = TOPIC_INTENT_HINTS[topicId];
    if (!hints) return 0;

    let boost = 0;
    const opener = hasQuestionOpener(normalized);

    for (const hint of hints) {
        if (!hint) continue;
        const matched = hint.includes(" ")
            ? normalized.includes(hint)
            : new RegExp(`\\b${escapeRegExp(hint)}\\b`).test(normalized);
        if (matched) {
            boost = Math.max(boost, 18 + hint.length * 2 + (opener ? 22 : 0));
        }
    }

    return boost;
}

/** Reduce trial matches when the user is clearly asking about human support. */
function scoreTrialPenalty(normalized, topicId) {
    if (topicId !== "trial") return 0;
    const supportIntent =
        /\b(support|help desk|customer service|customer support|technical support|human help|contact us|get in touch|assistance)\b/.test(
            normalized
        );
    const trialIntent = /\b(free trial|trial|try free|demo account|no credit card|test it out)\b/.test(normalized);
    if (supportIntent && !trialIntent) return -50;
    return 0;
}

function matchByIntentHints(normalized, question) {
    let best = null;
    let bestScore = 0;

    for (const [id, hints] of Object.entries(TOPIC_INTENT_HINTS)) {
        if (!PLATFORM_FAQ[id]) continue;
        for (const hint of hints) {
            const matched = hint.includes(" ")
                ? normalized.includes(hint)
                : new RegExp(`\\b${escapeRegExp(hint)}\\b`).test(normalized);
            if (!matched) continue;
            const score = hint.length * 3 + (hasQuestionOpener(normalized) ? 20 : 0);
            if (score > bestScore) {
                bestScore = score;
                best = id;
            }
        }
    }

    if (!best) return null;

    const entry = PLATFORM_FAQ[best];
    const answer = resolveFaqAnswer(best, entry);
    return {
        id: best,
        answer: formatReplyForQuestion(best, answer, question),
        title: entry.title,
    };
}

function isFollowUpQuestion(normalized) {
    return FOLLOW_UP_PATTERNS.some((p) => normalized.includes(p));
}

function isLikelyGibberish(normalized) {
    if (!normalized) return true;
    if (normalized.length <= 2) return true;
    const words = normalized.split(" ").filter(Boolean);
    if (words.length === 1 && words[0].length <= 3) return true;
    if (!/[aeiouy]/.test(normalized) && normalized.length < 12) return true;
    const keyboardMash = /^(asdf|qwer|zxcv|hjkl|asdfgh|qwerty|test123|xxx+|lol+|haha+)$/i;
    if (keyboardMash.test(normalized.replace(/\s/g, ""))) return true;
    if (words.length === 1 && words[0].length >= 5) {
        const w = words[0];
        if (/^[asdfghjkl]+$|^[qwertyuiop]+$|^[zxcvbnm]+$/i.test(w)) return true;
        const vowelRatio = (w.match(/[aeiouy]/gi) || []).length / w.length;
        if (vowelRatio < 0.12) return true;
    }
    return false;
}

/**
 * Match user text to the best FAQ topic.
 * @param {string} text
 * @param {{ lastTopicId?: string }} [context]
 * @returns {{ id: string, answer: string, title: string } | null}
 */
export function matchPlatformQuestion(text, context = {}) {
    const normalized = normalizeQuestionText(text);
    if (!normalized) return null;

    if (context.lastTopicId && isFollowUpQuestion(normalized)) {
        const entry = PLATFORM_FAQ[context.lastTopicId];
        if (entry) {
            const answer = resolveFaqAnswer(context.lastTopicId, entry);
            return {
                id: context.lastTopicId,
                answer: formatReplyForQuestion(context.lastTopicId, answer, text),
                title: entry.title,
            };
        }
    }

    let best = null;
    let bestScore = 0;

    for (const [id, entry] of Object.entries(PLATFORM_FAQ)) {
        let topicScore = 0;
        for (const kw of entry.keywords) {
            topicScore = Math.max(topicScore, scoreKeywordMatch(normalized, kw));
        }
        topicScore += scoreTopicIntentBoost(normalized, id);
        topicScore += scoreTrialPenalty(normalized, id);
        if (topicScore > bestScore) {
            bestScore = topicScore;
            best = { id, entry, score: topicScore };
        }
    }

    const MIN_SCORE = 18;
    if (best && bestScore >= MIN_SCORE) {
        const answer = resolveFaqAnswer(best.id, best.entry);
        return {
            id: best.id,
            answer: formatReplyForQuestion(best.id, answer, text),
            title: best.entry.title,
        };
    }

    const hinted = matchByIntentHints(normalized, text);
    if (hinted) return hinted;

    if (isLikelyGibberish(normalized)) {
        return { id: "unclear", answer: PLATFORM_UNCLEAR_REPLY, title: "Help" };
    }

    return null;
}

/**
 * Get answer for a topic id or free-text question.
 * @param {string} [topicOrQuestion]
 * @param {{ lastTopicId?: string }} [context]
 */
export function getPlatformAnswer(topicOrQuestion = "general", context = {}) {
    const topic = String(topicOrQuestion || "").toLowerCase();
    if (PLATFORM_FAQ[topic]) {
        const entry = PLATFORM_FAQ[topic];
        const answer = resolveFaqAnswer(topic, entry);
        return {
            id: topic,
            answer: formatReplyForQuestion(topic, answer, topicOrQuestion),
            title: entry.title,
        };
    }
    const matched = matchPlatformQuestion(topicOrQuestion, context);
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
