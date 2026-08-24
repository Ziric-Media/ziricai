/**
 * Conversation intelligence — keyword heuristics stub.
 * Replace analyzeMessage internals with OpenAI structured output later.
 */
import { countPassengersFromText } from "../inventory/seatingCapacity.js";
import { parseIntroducedPerson } from "../customerIdentity.js";

const TOPIC_KEYWORDS = {
    pricing: /\b(price|cost|quote|budget|how much|rate|fee|deposit|finance|financing)\b/i,
    support: /\b(help|issue|problem|broken|not working|support)\b/i,
    sales: /\b(buy|purchase|order|interested|demo|trial|hilux|vehicle|car)\b/i,
    booking: /\b(book|schedule|appointment|meeting|call|test drive)\b/i,
    website: /\b(website|web|site|landing page)\b/i,
    ai: /\b(ai|agent|chatbot|automation)\b/i,
    trade_in: /\b(trade.?in|trade in|exchange|swap)\b/i,
};

const INTENT_KEYWORDS = {
    question: /\?|what|how|when|where|why|can you|could you/i,
    complaint: /\b(unhappy|angry|frustrated|terrible|awful|refund)\b/i,
    purchase: /\b(buy|purchase|order|pay|invoice|apply|application)\b/i,
    greeting: /^(hi|hello|hey|good morning|good afternoon)\b/i,
};

const EMOTION_KEYWORDS = {
    excited: /\b(excited|can't wait|awesome|perfect|love it)\b/i,
    anxious: /\b(worried|concerned|unsure|nervous|stress)\b/i,
    frustrated: /\b(frustrated|angry|upset|terrible|awful)\b/i,
    grateful: /\b(thank|thanks|appreciate|grateful)\b/i,
};

function detectTopic(text) {
    for (const [topic, re] of Object.entries(TOPIC_KEYWORDS)) {
        if (re.test(text)) return topic;
    }
    return "general";
}

function detectIntent(text) {
    for (const [intent, re] of Object.entries(INTENT_KEYWORDS)) {
        if (re.test(text)) return intent;
    }
    return "general";
}

function detectEmotion(text) {
    for (const [emotion, re] of Object.entries(EMOTION_KEYWORDS)) {
        if (re.test(text)) return emotion;
    }
    return "neutral";
}

function detectUrgency(text) {
    if (/\b(urgent|asap|today|now|immediately|emergency)\b/i.test(text)) return "high";
    if (/\b(this week|soon|tomorrow|quickly)\b/i.test(text)) return "medium";
    return "low";
}

function detectCategory(topic, intent) {
    if (topic === "pricing" || topic === "trade_in") return "finance";
    if (topic === "sales" || intent === "purchase") return "sales";
    if (topic === "support" || intent === "complaint") return "support";
    if (topic === "booking") return "booking";
    return topic === "general" ? "general" : topic;
}

function scoreSentiment(text) {
    const lower = text.toLowerCase();
    const positive = (lower.match(/\b(thank|great|awesome|love|perfect|excellent|good|yes)\b/g) || []).length;
    const negative = (lower.match(/\b(bad|hate|angry|upset|terrible|awful|refund|no\b)\b/g) || []).length;
    if (negative > positive) return "negative";
    if (positive > negative) return "positive";
    return "neutral";
}

function scoreLeadQuality(text, intent, topic, urgency) {
    let score = 50;
    if (intent === "purchase") score += 25;
    if (topic === "pricing" || topic === "sales" || topic === "trade_in") score += 15;
    if (intent === "complaint") score -= 10;
    if (urgency === "high") score += 12;
    else if (urgency === "medium") score += 6;
    if (/\b(finance|financing|deposit|budget)\b/i.test(text)) score += 10;
    if (/\b(hilux|corolla|swift|vehicle)\b/i.test(text)) score += 8;
    return Math.max(0, Math.min(100, score));
}

function buildRecommendedAction(text, intent, topic, sentiment) {
    const lower = text.toLowerCase();
    const financeCount = (lower.match(/\b(finance|financing|deposit|loan|credit)\b/g) || []).length;

    if (financeCount >= 2 || (topic === "pricing" && /\bfinance\b/i.test(text))) {
        return {
            action: "Offer finance application link and confirm deposit requirements",
            reason: "Customer has asked about financing multiple times.",
            confidence: Math.min(98, 80 + financeCount * 5),
        };
    }
    if (topic === "trade_in" || /\btrade.?in\b/i.test(text)) {
        return {
            action: "Schedule trade-in valuation appointment",
            reason: "Customer mentioned a trade-in vehicle.",
            confidence: 88,
        };
    }
    if (topic === "booking" || /\btest drive\b/i.test(text)) {
        return {
            action: "Confirm test drive date and model preference",
            reason: "Customer wants to book an appointment.",
            confidence: 89,
        };
    }
    if (intent === "complaint" || sentiment === "negative") {
        return {
            action: "Escalate to human agent for resolution",
            reason: "Negative sentiment or complaint detected.",
            confidence: 85,
        };
    }
    if (intent === "purchase" || topic === "sales") {
        return {
            action: "Share product details and next-step purchase options",
            reason: "Strong purchase intent detected.",
            confidence: 82,
        };
    }
    return {
        action: "Continue conversation and gather requirements",
        reason: "General enquiry — clarify customer needs.",
        confidence: 70,
    };
}

export function analyzeMessage(phone, message, reply) {
    const text = String(message || "");
    const intent = detectIntent(text);
    const topic = detectTopic(text);
    const sentiment = scoreSentiment(text);
    const emotion = detectEmotion(text);
    const urgency = detectUrgency(text);
    const category = detectCategory(topic, intent);
    const leadQuality = scoreLeadQuality(text, intent, topic, urgency);
    const recommendation = buildRecommendedAction(text, intent, topic, sentiment);
    const escalationNeeded =
        sentiment === "negative" ||
        intent === "complaint" ||
        urgency === "high" ||
        /\b(manager|human|speak to someone|lawyer)\b/i.test(text);

    return {
        phone,
        sentiment,
        topic,
        intent,
        urgency,
        category,
        leadQuality,
        emotion,
        recommendedAction: recommendation.action,
        recommendedReason: recommendation.reason,
        confidence: recommendation.confidence,
        followUp: intent === "question" || topic === "pricing" || topic === "trade_in",
        escalationNeeded,
        replyPreview: String(reply || "").slice(0, 120),
        analyzedAt: new Date().toISOString(),
    };
}

function normalizeZarAmount(raw) {
    return String(raw || "")
        .replace(/\s+/g, "")
        .replace(/,(?=\d{3}\b)/g, ",")
        .toUpperCase();
}

/** Extract durable customer facts for memory storage (keyword heuristics). */
export function extractMemoryFacts(text) {
    const facts = [];
    const raw = String(text || "");
    const lower = raw.toLowerCase();

    const budgetWithAmount = raw.match(
        /\b(?:budget|afford(?:able)?|price\s*range|up\s*to|spending|working\s+with\s+a\s+budget)\s*(?:of|is|:)?\s*(R\s?[\d][\d,]*(?:\.\d{2})?)/i
    );
    const zarAmount = raw.match(/\bR\s?[\d][\d,]*(?:\.\d{2})?\b/i);
    if (budgetWithAmount?.[1]) {
        facts.push(`Customer budget: ${normalizeZarAmount(budgetWithAmount[1])}`);
    } else if (zarAmount && /\b(budget|afford|spend|finance|vehicle|car|fortuner|hilux|price|quotation|quote)\b/i.test(lower)) {
        facts.push(`Customer budget: ${normalizeZarAmount(zarAmount[0])}`);
    } else if (/\b(budget|afford|price range)\b/.test(lower)) {
        facts.push("Customer discussed budget (amount not specified)");
    }

    const familySize = countPassengersFromText(raw);
    if (familySize != null) {
        facts.push(`Family / passenger count: ${familySize}`);
    } else if (/\b(child|children|kid|son|daughter)\b/.test(lower)) {
        facts.push("Customer mentioned children");
    }

    const introduced = parseIntroducedPerson(raw);
    if (introduced?.name) {
        facts.push(`Household member: ${introduced.name} (${introduced.relationship || "co-decision-maker"})`);
    }

    if (/\b(too small|not enough seats|won't fit|need something bigger)\b/.test(lower)) {
        const vehicle = lower.match(/\b(fortuner|hilux|everest|x5)\b/);
        facts.push(vehicle ? `Objection: ${vehicle[0]} too small for family` : "Objection: vehicle too small for family");
    }

    if (/\b(finance|financing|deposit|loan)\b/.test(lower)) {
        facts.push("Customer asked about vehicle finance");
    }
    if (/\b(trade.?in|trade in)\b/.test(lower)) {
        facts.push("Customer mentioned trade-in");
    }
    const vehicleMatch = lower.match(/\b(hilux|corolla|swift|fortuner|toyota|suzuki|bmw|mercedes|audi|everest|land cruiser)\b/i);
    if (vehicleMatch) {
        facts.push(`Customer enquired about ${vehicleMatch[0]}`);
    }
    if (/\b(company|business|startup|enterprise)\b/.test(lower)) {
        facts.push("Customer mentioned their business");
    }

    const nameMatch = raw.match(
        /\b(?:my name is|i am|i'm|im|call me|this is|you can call me|please call me|name'?s)\s+([a-zA-Z][a-zA-Z'\-]*(?:\s+[a-zA-Z][a-zA-Z'\-]*){0,2})/i
    );
    const parsedName = nameMatch?.[1]?.trim();
    if (
        parsedName &&
        parsedName.length >= 2 &&
        !/^(here|there|good|fine|well|back|interested|looking|calling|messaging)$/i.test(parsedName)
    ) {
        facts.push(`Customer name: ${parsedName.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")}`);
    }

    return facts;
}
