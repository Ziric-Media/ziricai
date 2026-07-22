/**
 * Landing page marketplace packs — keep in sync with services/platform/marketplaceTemplate.js
 * (LANDING_MARKETPLACE_PACK_IDS) and pack metadata in marketplaceRegistry.js / employeePacks.js.
 * Browser ES module for static deploys — do not import from services/ in client bundles.
 */

/** @see services/platform/employeePacks.js INSTALL_TAGLINE */
export const INSTALL_TAGLINE = "Installs in minutes — customize your knowledge base and branding";

/** @see services/platform/marketplaceTemplate.js LANDING_MARKETPLACE_PACK_IDS */
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

/** Human-readable category labels for landing cards */
export const LANDING_CATEGORY_LABELS = {
    schools: "Education",
    law: "Legal",
    doctors: "Healthcare",
    sales: "Sales",
    support: "Support",
    scheduling: "Scheduling",
    finance: "Finance",
    hr: "HR",
    real_estate: "Real Estate",
    insurance: "Insurance",
    funeral: "Funeral",
    restaurants: "Hospitality",
    construction: "Construction",
    churches: "Faith",
    security: "Security",
};

/**
 * Curated short copy for landing cards (marketing-friendly; registry holds full descriptions).
 */
export const LANDING_MARKETPLACE_PACKS = [
    {
        id: "pack-school-ai",
        name: "School AI",
        icon: "🎓",
        category: "schools",
        description: "Admissions, fee queries, parent communication, and event scheduling.",
    },
    {
        id: "pack-law-ai",
        name: "Law Firm AI",
        icon: "⚖️",
        category: "law",
        description: "Client intake, consultation booking, and document collection.",
    },
    {
        id: "pack-clinic-ai",
        name: "Clinic AI",
        icon: "🩺",
        category: "doctors",
        description: "Appointment booking, prescription requests, and patient FAQs.",
    },
    {
        id: "pack-sales-ai",
        name: "Sales AI",
        icon: "💼",
        category: "sales",
        description: "Lead qualification, product info, quotes, and demo scheduling.",
    },
    {
        id: "pack-customer-support-ai",
        name: "Customer Support AI",
        icon: "🎧",
        category: "support",
        description: "Order tracking, returns, troubleshooting, and ticket intake.",
    },
    {
        id: "pack-appointment-ai",
        name: "Appointment AI",
        icon: "📅",
        category: "scheduling",
        description: "Book, reschedule, and confirm appointments across any business.",
    },
    {
        id: "pack-collections-ai",
        name: "Collections AI",
        icon: "💰",
        category: "finance",
        description: "Outstanding balances, payment plans, and invoice queries.",
    },
    {
        id: "pack-hr-ai",
        name: "HR AI",
        icon: "👥",
        category: "hr",
        description: "Leave policies, onboarding, payroll FAQs, and HR enquiries.",
    },
    {
        id: "pack-recruitment-ai",
        name: "Recruitment AI",
        icon: "🎯",
        category: "hr",
        description: "Open roles, application intake, and interview scheduling.",
    },
    {
        id: "pack-estate-agent-ai",
        name: "Estate Agent AI",
        icon: "🏠",
        category: "real_estate",
        description: "Property listings, viewing bookings, and buyer lead qualification.",
    },
    {
        id: "pack-insurance-ai",
        name: "Insurance AI",
        icon: "🛡️",
        category: "insurance",
        description: "Quotes, claims intake, and policy FAQs for brokers.",
    },
    {
        id: "pack-funeral-ai",
        name: "Funeral AI",
        icon: "💐",
        category: "funeral",
        description: "Compassionate bereavement intake, arrangements, and family support.",
    },
    {
        id: "pack-restaurant-ai",
        name: "Restaurant AI",
        icon: "🍽️",
        category: "restaurants",
        description: "Table reservations, menu questions, and dietary requests.",
    },
    {
        id: "pack-construction-ai",
        name: "Construction AI",
        icon: "🏗️",
        category: "construction",
        description: "Project quotes, site visit scheduling, and lead intake.",
    },
    {
        id: "pack-church-ai",
        name: "Church AI",
        icon: "⛪",
        category: "churches",
        description: "Service times, events, pastoral enquiries, and prayer requests.",
    },
    {
        id: "pack-security-ai",
        name: "Security AI",
        icon: "🛡️",
        category: "security",
        description: "Access control, incident reporting, and patrol schedule FAQs.",
    },
];

export function getLandingMarketplacePacks() {
    return LANDING_MARKETPLACE_PACKS.map((pack) => ({
        ...pack,
        categoryLabel: LANDING_CATEGORY_LABELS[pack.category] || pack.category,
        tagline: INSTALL_TAGLINE,
    }));
}
