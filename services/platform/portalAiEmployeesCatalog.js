/**
 * Tenant Portal marketplace — cross-industry AI employees (not vertical industry packs).
 * Marketing site / full registry may still expose industry packs; portal catalog uses audience=portal.
 */

export const PORTAL_AI_EMPLOYEE_CATEGORIES = [
    { id: "sales", label: "Sales", icon: "💼", color: "#2563eb" },
    { id: "marketing", label: "Marketing", icon: "📈", color: "#db2777" },
    { id: "finance", label: "Finance", icon: "💰", color: "#ca8a04" },
    { id: "hr", label: "Human Resources", icon: "👥", color: "#8b5cf6" },
    { id: "administration", label: "Administration", icon: "📋", color: "#6366f1" },
    { id: "support", label: "Customer Support", icon: "🎧", color: "#0891b2" },
    { id: "operations", label: "Operations", icon: "⚙️", color: "#64748b" },
];

/** Pack IDs shown in Company Portal AI Marketplace browse grid */
export const PORTAL_AI_EMPLOYEE_PACK_IDS = [
    "pack-sales-ai",
    "pack-automotive-ai",
    "pack-marketing-ai",
    "pack-collections-ai",
    "pack-hr-ai",
    "pack-recruitment-ai",
    "pack-customer-support-ai",
    "pack-receptionist-ai",
    "pack-appointment-ai",
];

/** Portal-facing labels (pack IDs unchanged for install / entitlement compatibility) */
export const PORTAL_PACK_DISPLAY_OVERRIDES = {
    "pack-sales-ai": {
        name: "Sales AI",
        category: "sales",
        tagline: "Qualify leads, quotes, and follow-ups — 24/7.",
    },
    "pack-automotive-ai": {
        name: "Automotive Sales AI",
        category: "sales",
        tagline: "Vehicle sales, finance, test drives, and trade-ins for dealerships.",
    },
    "pack-marketing-ai": {
        name: "Marketing AI",
        category: "marketing",
        tagline: "Campaigns, social replies, and lead nurturing.",
    },
    "pack-collections-ai": {
        name: "Finance AI",
        category: "finance",
        tagline: "Billing, payment plans, and account queries.",
    },
    "pack-hr-ai": {
        name: "HR AI",
        category: "hr",
        tagline: "Leave, policies, onboarding, and payroll FAQs.",
    },
    "pack-recruitment-ai": {
        name: "Recruitment AI",
        category: "hr",
        tagline: "Applicant screening and interview scheduling.",
    },
    "pack-customer-support-ai": {
        name: "Customer Support AI",
        category: "support",
        tagline: "Orders, troubleshooting, and escalations.",
    },
    "pack-receptionist-ai": {
        name: "Receptionist AI",
        category: "administration",
        tagline: "Front desk, enquiries, and call routing.",
    },
    "pack-appointment-ai": {
        name: "Appointment AI",
        category: "administration",
        tagline: "Book, reschedule, and confirm appointments.",
    },
};

/**
 * @param {Array<object>} catalogPacks — output of getCatalogPacks()
 * @returns {{ packs: object[], categories: typeof PORTAL_AI_EMPLOYEE_CATEGORIES }}
 */
export function applyPortalAiEmployeeCatalog(catalogPacks) {
    const allowed = new Set(PORTAL_AI_EMPLOYEE_PACK_IDS);
    const order = PORTAL_AI_EMPLOYEE_PACK_IDS;

    const packs = catalogPacks
        .filter((p) => {
            const id = p.canonicalId || p.id;
            return allowed.has(id) && p.status !== "coming_soon" && p.installable !== false;
        })
        .map((p) => {
            const id = p.canonicalId || p.id;
            const overrides = PORTAL_PACK_DISPLAY_OVERRIDES[id];
            if (!overrides) return { ...p };
            return {
                ...p,
                ...overrides,
                legacyCategory: p.legacyCategory || p.category,
            };
        })
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    return {
        packs,
        categories: PORTAL_AI_EMPLOYEE_CATEGORIES,
    };
}

export function isPortalAiEmployeeAudience(audience) {
    return audience === "portal" || audience === "ai_employees";
}
