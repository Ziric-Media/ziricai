/**
 * Marketplace template model — base packs, industry inheritance, manifest enrichment.
 * Legacy pack definitions in marketplaceRegistry/employeePacks are normalized here.
 */

/** Browse categories for catalog filters (display labels) */
export const MARKETPLACE_BROWSE_CATEGORIES = [
    { id: "education", label: "Education", icon: "🎓", color: "#7c3aed", legacyIds: ["schools"] },
    { id: "legal", label: "Legal", icon: "⚖️", color: "#b45309", legacyIds: ["law"] },
    { id: "healthcare", label: "Healthcare", icon: "🩺", color: "#059669", legacyIds: ["doctors", "dentists"] },
    { id: "funeral", label: "Funeral", icon: "💐", color: "#6b7280", legacyIds: ["funeral"] },
    { id: "sales", label: "Sales", icon: "💼", color: "#2563eb", legacyIds: ["sales"] },
    { id: "hospitality", label: "Hospitality", icon: "🏨", color: "#db2777", legacyIds: ["hotels", "restaurants"] },
    { id: "faith", label: "Faith", icon: "⛪", color: "#9333ea", legacyIds: ["churches"] },
    { id: "construction", label: "Construction", icon: "🏗️", color: "#ea580c", legacyIds: ["construction"] },
    { id: "security", label: "Security", icon: "🛡️", color: "#0369a1", legacyIds: ["security", "insurance"] },
    { id: "food", label: "Food", icon: "🍽️", color: "#dc2626", legacyIds: ["restaurants"] },
    { id: "automotive", label: "Automotive", icon: "🚗", color: "#2563eb", legacyIds: ["automotive"] },
    { id: "retail", label: "Retail", icon: "🛒", color: "#16a34a", legacyIds: ["retail"] },
];

/** Pack IDs shown on the marketing landing page marketplace section */
export const LANDING_MARKETPLACE_PACK_IDS = [
    "pack-school-ai",
    "pack-law-ai",
    "pack-clinic-ai",
    "pack-sales-ai",
    "pack-customer-support-ai",
    "pack-appointment-ai",
    "pack-collections-ai",
    "pack-hr-ai",
    "pack-recruitment-ai",
    "pack-estate-agent-ai",
    "pack-insurance-ai",
    "pack-funeral-ai",
    "pack-restaurant-ai",
    "pack-construction-ai",
    "pack-church-ai",
    "pack-security-ai",
];

/** Canonical pack IDs for the 12 flagship marketplace items */
export const FLAGSHIP_PACK_IDS = [
    "pack-school-ai",
    "pack-law-ai",
    "pack-clinic-ai",
    "pack-funeral-ai",
    "pack-sales-ai",
    "pack-receptionist-ai",
    "pack-church-ai",
    "pack-construction-ai",
    "pack-security-ai",
    "pack-restaurant-ai",
    "pack-automotive-ai",
    "pack-retail-ai",
];

/** Legacy ID → canonical ID (backward-compatible installs) */
export const PACK_ID_ALIASES = {
    "pack-school-receptionist": "pack-school-ai",
    "pack-law-receptionist": "pack-law-ai",
    "pack-medical-receptionist": "pack-clinic-ai",
    "pack-automotive": "pack-automotive-ai",
    "pack-funeral-parlour": "pack-funeral-ai",
    "pack-real-estate": "pack-estate-agent-ai",
};

/** Canonical display names for flagship packs */
export const FLAGSHIP_DISPLAY_NAMES = {
    "pack-school-ai": "School AI",
    "pack-law-ai": "Law Firm AI",
    "pack-clinic-ai": "Clinic AI",
    "pack-funeral-ai": "Funeral AI",
    "pack-sales-ai": "Sales AI",
    "pack-receptionist-ai": "Receptionist AI",
    "pack-church-ai": "Church AI",
    "pack-construction-ai": "Construction AI",
    "pack-security-ai": "Security AI",
    "pack-restaurant-ai": "Restaurant AI",
    "pack-automotive-ai": "Automotive AI",
    "pack-retail-ai": "Retail AI",
};

/** Template inheritance chain — child extends parent */
export const TEMPLATE_INHERITANCE = {
    "pack-receptionist-ai": null,
    "pack-school-ai": "pack-receptionist-ai",
    "pack-law-ai": "pack-receptionist-ai",
    "pack-clinic-ai": "pack-receptionist-ai",
    "pack-school-receptionist": "pack-receptionist-ai",
    "pack-law-receptionist": "pack-receptionist-ai",
    "pack-medical-receptionist": "pack-receptionist-ai",
};

/** Demo pricing — 0 = free, 999 = paid (no Stripe yet) */
export const PACK_PRICING = {
    "pack-receptionist-ai": 0,
    "pack-school-ai": 0,
    "pack-law-ai": 999,
    "pack-clinic-ai": 0,
    "pack-funeral-ai": 0,
    "pack-sales-ai": 999,
    "pack-church-ai": 0,
    "pack-construction-ai": 999,
    "pack-security-ai": 999,
    "pack-restaurant-ai": 0,
    "pack-automotive-ai": 999,
    "pack-retail-ai": 0,
    "pack-automotive": 999,
    "pack-estate-agent-ai": 999,
    "pack-dentist": 999,
};

/** Demo aggregate ratings per pack */
export const PACK_DEMO_RATINGS = {
    "pack-school-ai": { average: 4.8, count: 124 },
    "pack-law-ai": { average: 4.6, count: 89 },
    "pack-clinic-ai": { average: 4.9, count: 156 },
    "pack-funeral-ai": { average: 4.9, count: 67 },
    "pack-sales-ai": { average: 4.7, count: 203 },
    "pack-receptionist-ai": { average: 4.8, count: 312 },
    "pack-church-ai": { average: 4.7, count: 78 },
    "pack-construction-ai": { average: 4.5, count: 45 },
    "pack-security-ai": { average: 4.6, count: 34 },
    "pack-restaurant-ai": { average: 4.8, count: 91 },
    "pack-automotive-ai": { average: 4.7, count: 118 },
    "pack-retail-ai": { average: 4.6, count: 82 },
};

/** Suggested integrations per category */
const DEFAULT_INTEGRATIONS = ["whatsapp", "webchat", "email"];
const CATEGORY_INTEGRATIONS = {
    schools: ["whatsapp", "email", "sms"],
    law: ["whatsapp", "email", "google_calendar"],
    doctors: ["whatsapp", "email", "google_calendar", "sms"],
    funeral: ["whatsapp", "email", "sms"],
    sales: ["whatsapp", "webchat", "email", "facebook", "instagram"],
    churches: ["whatsapp", "email", "sms"],
    construction: ["whatsapp", "email", "sms"],
    security: ["whatsapp", "email", "sms"],
    restaurants: ["whatsapp", "webchat", "email"],
    automotive: ["whatsapp", "webchat", "email", "facebook"],
    retail: ["whatsapp", "webchat", "email", "instagram"],
};

/** Base Receptionist AI template — parent for industry receptionist variants */
export const BASE_RECEPTIONIST_TEMPLATE = {
    id: "pack-receptionist-ai",
    name: "Receptionist AI",
    category: "hospitality",
    browseCategory: "hospitality",
    icon: "📞",
    color: "#6366f1",
    version: "1.0.0",
    latestVersion: "1.1.0",
    author: "ZiricAI",
    featured: true,
    installable: true,
    extends: null,
    agents: [
        {
            name: "Riley (AI)",
            role: "receptionist",
            roleLabel: "Front Desk Receptionist",
            avatar: "📞",
            personality: "professional",
            greetingMessage:
                "Hello! I'm Riley, your front desk assistant. I can help with enquiries, appointments, and general information. How may I assist you?",
            systemPrompt: `You are Riley, a professional front desk receptionist AI.
Greet visitors warmly, answer general enquiries, route calls and messages, and schedule appointments.
Never share confidential information without verification. Escalate urgent matters to a human team member.`,
        },
    ],
    knowledge: [
        {
            title: "Front Desk Procedures",
            type: "manual",
            content:
                "Greet every visitor within 30 seconds. Log enquiries in CRM. Offer appointment slots Mon–Fri 08:00–17:00. Escalate emergencies immediately.",
        },
        {
            title: "FAQ — Office Hours & Location",
            type: "faq",
            content: "Office hours Mon–Fri 08:00–17:00. Closed weekends and public holidays. Directions and parking info on website.",
        },
        {
            title: "FAQ — Appointment Booking",
            type: "faq",
            content:
                "Book appointments via WhatsApp or phone. Confirm name, contact, date, time, and purpose. Send confirmation message after booking.",
        },
    ],
    workflows: [
        {
            name: "General Enquiry Intake",
            nodes: [],
        },
    ],
    crmTemplates: {
        label: "Reception CRM",
        stages: ["new_enquiry", "appointment_pending", "confirmed", "completed"],
        fields: [
            { key: "enquiryType", label: "Enquiry Type", type: "text" },
            { key: "preferredContact", label: "Preferred Contact", type: "text" },
        ],
        defaultTags: ["reception", "enquiry"],
    },
    analytics: {
        satisfaction: 96,
        conversations: 24,
        messages: 96,
        leadScoreAvg: 62,
        metrics: ["enquiries", "appointments_booked", "response_time"],
    },
    prompts: [
        { id: "greeting", name: "Standard Greeting", template: "Hello! How may I assist you today?" },
        { id: "closing", name: "Closing", template: "Thank you for contacting us. Have a great day!" },
    ],
    suggestedActions: [
        { id: "book_appointment", label: "Book Appointment", icon: "fa-calendar" },
        { id: "transfer_human", label: "Transfer to Human", icon: "fa-user" },
        { id: "send_brochure", label: "Send Info Brochure", icon: "fa-file" },
    ],
};

export function resolveCanonicalPackId(packId) {
    return PACK_ID_ALIASES[packId] || packId;
}

export function resolveBrowseCategory(legacyCategory) {
    const found = MARKETPLACE_BROWSE_CATEGORIES.find(
        (c) => c.id === legacyCategory || c.legacyIds?.includes(legacyCategory)
    );
    return found?.id || legacyCategory;
}

export function getInheritanceChain(packId) {
    const chain = [];
    let current = resolveCanonicalPackId(packId);
    const seen = new Set();
    while (current && !seen.has(current)) {
        seen.add(current);
        chain.unshift(current);
        current = TEMPLATE_INHERITANCE[current] || null;
    }
    return chain;
}

function extractFaqs(knowledge = []) {
    return knowledge.filter((k) => k.type === "faq").map((k) => ({ title: k.title, content: k.content }));
}

function extractPrompts(agents = [], extra = []) {
    const fromAgents = agents.map((a) => ({
        id: `system-${a.role || "default"}`,
        name: `${a.roleLabel || a.name} System Prompt`,
        template: a.systemPrompt,
    }));
    return [...fromAgents, ...extra];
}

/**
 * Build normalized pack manifest from legacy pack definition.
 */
export function buildPackManifest(pack) {
    if (!pack) return null;

    const canonicalId = resolveCanonicalPackId(pack.id);
    const browseCategory = pack.browseCategory || resolveBrowseCategory(pack.category);
    const price = pack.price ?? PACK_PRICING[canonicalId] ?? PACK_PRICING[pack.id] ?? 0;
    const ratingData = PACK_DEMO_RATINGS[canonicalId] || PACK_DEMO_RATINGS[pack.id] || { average: 4.5, count: 12 };
    const integrations =
        pack.suggestedIntegrations ||
        CATEGORY_INTEGRATIONS[pack.category] ||
        DEFAULT_INTEGRATIONS;

    const contents = {
        knowledge: (pack.knowledge || []).map((k) => k.title),
        flows: (pack.workflows || []).map((w) => w.name),
        automations: (pack.workflows || []).map((w) => w.name),
        integrations,
        prompts: extractPrompts(pack.agents, pack.prompts).map((p) => p.name),
        faqs: extractFaqs(pack.knowledge).map((f) => f.title),
        actions: (pack.suggestedActions || BASE_RECEPTIONIST_TEMPLATE.suggestedActions).map((a) => a.label),
        analytics: pack.analytics?.metrics || ["enquiries", "response_time", "satisfaction"],
    };

    const displayName = FLAGSHIP_DISPLAY_NAMES[canonicalId] || pack.name;

    return {
        id: pack.id,
        canonicalId,
        name: displayName,
        category: browseCategory,
        legacyCategory: pack.category,
        icon: pack.icon,
        color: pack.color,
        tagline: pack.tagline,
        description: pack.description,
        price,
        priceLabel: price === 0 ? "Free" : "Paid",
        isFree: price === 0,
        isPaid: price > 0,
        version: pack.version || "1.0.0",
        latestVersion: pack.latestVersion || "1.1.0",
        rating: ratingData.average,
        ratingCount: ratingData.count,
        author: pack.author || "ZiricAI",
        featured: pack.featured,
        installable: pack.installable !== false,
        extends: TEMPLATE_INHERITANCE[pack.id] || TEMPLATE_INHERITANCE[canonicalId] || null,
        inheritanceChain: getInheritanceChain(pack.id),
        contents,
        includes: pack.includes || [
            `${pack.agents?.length || 1} AI Employee`,
            `${contents.knowledge.length} Knowledge Docs`,
            `${contents.flows.length} Workflows`,
            "CRM Templates",
            "Analytics Seed",
        ],
        agents: pack.agents,
        knowledge: pack.knowledge,
        workflows: pack.workflows,
        crmTemplates: pack.crmTemplates,
        analytics: pack.analytics,
        reports: pack.reports,
        prompts: extractPrompts(pack.agents, pack.prompts),
        suggestedIntegrations: integrations,
        suggestedActions: pack.suggestedActions || BASE_RECEPTIONIST_TEMPLATE.suggestedActions,
        status: pack.status || "available",
    };
}

/**
 * Merge parent template into child — child overrides win.
 */
export function mergeTemplateChain(packsById, packId) {
    const chain = getInheritanceChain(packId);
    let merged = null;
    for (const id of chain) {
        const layer = packsById[id] || (id === "pack-receptionist-ai" ? BASE_RECEPTIONIST_TEMPLATE : null);
        if (!layer) continue;
        if (!merged) {
            merged = { ...layer, knowledge: [...(layer.knowledge || [])], workflows: [...(layer.workflows || [])] };
        } else {
            merged = {
                ...merged,
                ...layer,
                id: layer.id,
                name: layer.name || merged.name,
                knowledge: [...(merged.knowledge || []), ...(layer.knowledge || [])],
                workflows: [...(merged.workflows || []), ...(layer.workflows || [])],
                agents: layer.agents?.length ? layer.agents : merged.agents,
            };
        }
    }
    return merged;
}

/** Demo reviews seeded per flagship pack */
export function getDemoReviews(packId) {
    const canonical = resolveCanonicalPackId(packId);
    const reviews = {
        "pack-school-ai": [
            { id: "rev-1", author: "Principal M.", rating: 5, title: "Perfect for admissions season", body: "Parents get instant answers about fees and applications. Saved our office hours.", createdAt: "2026-06-12T10:00:00Z" },
            { id: "rev-2", author: "Admin Lead", rating: 5, title: "Easy install", body: "Installed in under 5 minutes. Customized branding and we were live.", createdAt: "2026-05-20T14:30:00Z" },
        ],
        "pack-receptionist-ai": [
            { id: "rev-r1", author: "Office Manager", rating: 5, title: "Great base template", body: "We extended it for our clinic. Inheritance worked perfectly.", createdAt: "2026-06-01T09:00:00Z" },
        ],
        "pack-automotive-ai": [
            { id: "rev-a1", author: "Dealer GM", rating: 5, title: "Test drive bookings up 40%", body: "Sarah handles finance enquiries and test drive scheduling flawlessly.", createdAt: "2026-06-15T11:00:00Z" },
        ],
    };
    return reviews[canonical] || reviews[packId] || [
        { id: "rev-default", author: "Verified Tenant", rating: 5, title: "Works great", body: "Installed quickly and customized our knowledge base easily.", createdAt: "2026-06-01T12:00:00Z" },
    ];
}

export function createBaseTemplate(overrides = {}) {
    return buildPackManifest({ ...BASE_RECEPTIONIST_TEMPLATE, ...overrides });
}
