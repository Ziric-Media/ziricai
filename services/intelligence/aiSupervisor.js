/**
 * AI Supervisor — watches conversations, scores reply quality, suggests improvements.
 * Demo heuristics stub; replace with OpenAI structured evaluation in production.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";

function uid(prefix = "sup") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
    return new Date().toISOString();
}

const WEAK_PATTERNS = [
    /\b(i don't know|not sure|cannot help)\b/i,
    /\b(as an ai|language model)\b/i,
    /\b(sorry.{0,20}can't)\b/i,
];

const STRONG_PATTERNS = [
    /\b(happy to help|let me|i can|we offer|next step)\b/i,
    /\b(book|schedule|confirm|follow up)\b/i,
];

/**
 * Evaluate a single agent reply against customer message context.
 * @returns {{ qualityScore: number, grade: string, issues: string[], recommendations: string[], promptSuggestions: string[] }}
 */
export function evaluateConversation({
    customerMessage = "",
    agentReply = "",
    analysis = {},
} = {}) {
    const issues = [];
    const recommendations = [];
    const promptSuggestions = [];
    let score = 72;

    const msgLen = String(agentReply).trim().length;
    const custLen = String(customerMessage).trim().length;

    if (msgLen < 20) {
        score -= 15;
        issues.push("Reply too short — may feel dismissive");
        recommendations.push("Expand with a warm greeting and a clarifying question");
        promptSuggestions.push("Always acknowledge the customer's concern before answering");
    }

    if (msgLen > 800) {
        score -= 8;
        issues.push("Reply may be too long for WhatsApp");
        recommendations.push("Break into shorter paragraphs or offer a call-back");
    }

    for (const re of WEAK_PATTERNS) {
        if (re.test(agentReply)) {
            score -= 12;
            issues.push("Reply contains uncertain or generic AI phrasing");
            recommendations.push("Use confident, brand-aligned language from the knowledge base");
            promptSuggestions.push("Never say 'I don't know' — offer to connect with a human specialist");
            break;
        }
    }

    for (const re of STRONG_PATTERNS) {
        if (re.test(agentReply)) score += 6;
    }

    if (analysis.sentiment === "negative" && !/\b(sorry|understand|apolog)\b/i.test(agentReply)) {
        score -= 10;
        issues.push("Customer sentiment negative but reply lacks empathy");
        recommendations.push("Lead with empathy before procedural steps");
        promptSuggestions.push("When sentiment is negative, acknowledge feelings first");
    }

    if (analysis.escalationNeeded && !/\b(human|team member|call you|specialist)\b/i.test(agentReply)) {
        score -= 8;
        issues.push("Escalation flagged but no human handoff offered");
        recommendations.push("Offer immediate human callback or staff assignment");
    }

    if (analysis.intent === "question" && !/\?/.test(agentReply) && msgLen < 120) {
        score -= 5;
        recommendations.push("Ask a follow-up question to qualify the enquiry");
    }

    if (custLen > 40 && !/\b(hi|hello|thank)\b/i.test(agentReply.slice(0, 40))) {
        score += 3;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "needs_improvement";

    if (grade === "needs_improvement" && !promptSuggestions.length) {
        promptSuggestions.push("Review knowledge base coverage for this topic");
    }

    return {
        qualityScore: score,
        grade,
        issues,
        recommendations,
        promptSuggestions,
    };
}

/**
 * Run supervisor pipeline and persist review for admin UI.
 */
export async function superviseReply(context = {}) {
    const evaluation = evaluateConversation(context);
    const review = {
        id: uid(),
        companyId: context.companyId || null,
        agentId: context.agentId || null,
        phone: context.phone || null,
        customerMessage: String(context.customerMessage || "").slice(0, 300),
        agentReply: String(context.agentReply || "").slice(0, 500),
        analysis: context.analysis || {},
        ...evaluation,
        createdAt: now(),
    };

    const store = await getStorageAdapter();
    if (store.saveSupervisorReview && context.companyId) {
        await store.saveSupervisorReview(context.companyId, review);
    }

    return review;
}

export async function listSupervisorReviews(companyId, limit = 20) {
    const store = await getStorageAdapter();
    if (store.listSupervisorReviews) {
        return { items: await store.listSupervisorReviews(companyId, limit) };
    }
    return { items: [] };
}

export async function getSupervisorSummary(companyId) {
    const { items } = await listSupervisorReviews(companyId, 50);
    if (!items.length) {
        return {
            avgScore: null,
            reviewCount: 0,
            gradeDistribution: {},
            recentRecommendations: [],
        };
    }
    const avgScore = Math.round(items.reduce((s, r) => s + (r.qualityScore || 0), 0) / items.length);
    const gradeDistribution = items.reduce((acc, r) => {
        acc[r.grade] = (acc[r.grade] || 0) + 1;
        return acc;
    }, {});
    const recentRecommendations = [...new Set(items.flatMap((r) => r.recommendations || []).slice(0, 5))];
    return { avgScore, reviewCount: items.length, gradeDistribution, recentRecommendations };
}
