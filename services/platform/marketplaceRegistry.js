/**
 * ZiricAI Marketplace Registry — Industry Pack definitions & v2.0 roadmap
 * =============================================================================
 *
 * ARCHITECTURE (v2.0)
 * -------------------
 * Marketplace (MVP)  → Browse categories, install ZiricAI-curated industry packs
 * Industry Packs       → JSON bundles: agents, knowledge, workflows, CRM, analytics
 * AI Store (future)    → Third-party pack publishing via THIRD_PARTY_REGISTRY
 * AI Supervisor        → Post-reply quality scoring & prompt improvement loop
 *
 * ROADMAP — Enterprise
 * --------------------
 * • SSO / SAML + SCIM user provisioning for large tenants
 * • Multi-region data residency & dedicated Firestore instances
 * • Custom pack authoring studio with approval workflows
 * • SLA dashboards, audit logs, and compliance export (POPIA/GDPR)
 * • White-label marketplace with private pack catalogues per enterprise
 * • Usage-based billing tiers tied to pack installs & message volume
 *
 * ROADMAP — Mobile
 * ----------------
 * • React Native / Expo companion app for owners & managers
 * • Push notifications for escalations, supervisor alerts, install confirmations
 * • Mobile inbox with human takeover & quick replies
 * • Offline CRM snapshot & voice note capture synced to tenant
 * • Biometric login + tenant switcher for multi-company admins
 *
 * ROADMAP — AI Store (third-party)
 * --------------------------------
 * • Pack submission portal with automated validation & sandbox install
 * • Revenue share, versioning, rollback, and publisher analytics
 * • Verified publisher badges and security review pipeline
 * • In-app ratings, reviews, and dependency resolution between packs
 */

import { EMPLOYEE_AI_PACKS, INSTALL_TAGLINE } from "./employeePacks.js";
import {
    MARKETPLACE_BROWSE_CATEGORIES,
    PACK_ID_ALIASES,
    BASE_RECEPTIONIST_TEMPLATE,
    buildPackManifest,
} from "./marketplaceTemplate.js";

/** Browse categories shown in Marketplace UI */
export const MARKETPLACE_CATEGORIES = MARKETPLACE_BROWSE_CATEGORIES;

/** Legacy pack IDs → current canonical IDs (backward-compatible installs) */
export const PACK_ALIASES = {
    ...PACK_ID_ALIASES,
    "pack-funeral-parlour": "pack-funeral-ai",
    "pack-real-estate": "pack-estate-agent-ai",
    "pack-school-receptionist": "pack-school-ai",
    "pack-law-receptionist": "pack-law-ai",
    "pack-medical-receptionist": "pack-clinic-ai",
    "pack-automotive": "pack-automotive-ai",
};

/** Future third-party pack registry (AI Store scaffold) */
export const THIRD_PARTY_REGISTRY = [
    {
        id: "tp-hospitality-suite",
        name: "Hospitality Pro Suite",
        author: "Acme AI Labs",
        version: "0.9.0-beta",
        category: "hotels",
        status: "coming_soon",
        description: "Guest concierge, booking automation, and upsell workflows for boutique hotels.",
    },
    {
        id: "tp-legal-intake",
        name: "Legal Intake Accelerator",
        author: "LexFlow Partners",
        version: "1.0.0-rc",
        category: "law",
        status: "coming_soon",
        description: "Client intake forms, conflict checks, and appointment scheduling for law firms.",
    },
    {
        id: "tp-school-comms",
        name: "School Comms Hub",
        author: "EduTech Collective",
        version: "0.8.2",
        category: "schools",
        status: "coming_soon",
        description: "Parent notifications, fee reminders, and event RSVP workflows.",
    },
];

const wfNode = (id, type, stepType, label, icon, config = {}) => ({
    id,
    type,
    stepType,
    label,
    icon,
    config,
});

/** Fully provisioned demo industry packs */
export const INDUSTRY_PACKS = [
    {
        id: "pack-funeral-ai",
        name: "Funeral AI",
        category: "funeral",
        icon: "💐",
        color: "#6b7280",
        tagline: INSTALL_TAGLINE,
        description:
            "Grace (Compassion Counselor AI), sympathy workflows, bereavement CRM fields, and FAQ knowledge for funeral homes. " +
            INSTALL_TAGLINE + ".",
        version: "1.0.0",
        author: "ZiricAI",
        featured: true,
        installable: true,
        includes: ["1 AI Employee", "6 Knowledge Docs", "2 Workflows", "CRM Templates", "Analytics Seed", "2 Reports"],
        agents: [
            {
                name: "Grace (AI)",
                role: "compassion_counselor",
                roleLabel: "Compassion Counselor",
                avatar: "💐",
                personality: "empathetic",
                greetingMessage:
                    "I'm Grace. I'm here to help with arrangements and answer questions with care. How may I support you today?",
                systemPrompt: `You are Grace, a compassionate funeral parlour assistant.
Speak with warmth, dignity, and sensitivity. Never rush grieving families.
Help with service arrangements, viewing times, documentation, and general FAQs.
If someone is in acute distress, acknowledge their feelings and offer to connect them with a human counsellor.`,
            },
        ],
        knowledge: [
            {
                title: "Arrangement Process Overview",
                type: "manual",
                content:
                    "Step-by-step guide: initial contact → family meeting → service type selection → documentation → viewing/funeral day logistics.",
            },
            {
                title: "FAQ — What to Do When Someone Passes",
                type: "faq",
                content:
                    "Contact us 24/7. We will guide you through obtaining a death certificate, notifying authorities, and arranging transport. We can meet at home, hospital, or our parlour.",
            },
            {
                title: "FAQ — Service Types & Pricing",
                type: "faq",
                content:
                    "We offer burial, cremation, memorial, and repatriation services. Packages start from basic to premium. A consultant provides a written quote after understanding your wishes.",
            },
            {
                title: "FAQ — Documentation Required",
                type: "faq",
                content:
                    "Death certificate, ID of deceased, ID of next of kin, and burial/cremation order. We assist with Home Affairs and cemetery/crematorium bookings.",
            },
            {
                title: "Sympathy & Grief Support Resources",
                type: "policies",
                content:
                    "We partner with bereavement counsellors. Grief support line available Mon–Fri 08:00–17:00. After-hours emergency pastoral care on request.",
            },
            {
                title: "Business Hours & Emergency Line",
                type: "faq",
                content: "Office: Mon–Fri 08:00–17:00, Sat 08:00–12:00. Emergency line 24/7 for immediate assistance after a passing.",
            },
        ],
        workflows: [
            {
                name: "Sympathy Intake — WhatsApp",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Bereavement keywords", "fa-solid fa-filter", {
                        keyword: "passed away|death|funeral|cremation",
                        matchMode: "any",
                    }),
                    wfNode("n3", "ai_action", "extract_entities", "Extract urgency & location", "fa-solid fa-tags", {
                        entities: ["urgency", "location"],
                    }),
                    wfNode("n4", "action", "create_task", "Assign family liaison", "fa-solid fa-list-check", {
                        title: "Bereavement intake — call within 30 min",
                        priority: "high",
                    }),
                    wfNode("n5", "action", "reply", "Send compassion template", "fa-solid fa-reply", {
                        template: "sympathy_acknowledgement",
                    }),
                ],
            },
            {
                name: "Viewing Appointment Booking",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Viewing request", "fa-solid fa-filter", {
                        keyword: "viewing|visit|see",
                    }),
                    wfNode("n3", "action", "reply", "Offer viewing slots", "fa-solid fa-reply", {
                        template: "viewing_slots",
                    }),
                    wfNode("n4", "action", "update_crm", "Tag — viewing scheduled", "fa-solid fa-address-book", {
                        stage: "viewing_scheduled",
                    }),
                ],
            },
        ],
        crmTemplates: {
            label: "Funeral Parlour CRM",
            stages: ["new_enquiry", "family_meeting", "arrangements", "viewing_scheduled", "service_complete"],
            fields: [
                { key: "deceasedName", label: "Deceased Name", type: "text" },
                { key: "serviceType", label: "Service Type", type: "select", options: ["Burial", "Cremation", "Memorial", "Repatriation"] },
                { key: "nextOfKin", label: "Next of Kin", type: "text" },
                { key: "urgency", label: "Urgency", type: "select", options: ["Immediate", "Within 24h", "Planning"] },
            ],
            defaultTags: ["bereavement", "sympathy"],
        },
        analytics: {
            satisfaction: 98,
            conversations: 12,
            messages: 48,
            leadScoreAvg: 72,
            metrics: ["sympathy_response_time", "viewing_bookings", "family_liaison_tasks"],
        },
        reports: [
            { id: "rpt-funeral-weekly", name: "Weekly Bereavement Enquiries", type: "weekly_summary" },
            { id: "rpt-funeral-viewings", name: "Viewing Appointments Report", type: "pipeline" },
        ],
    },
    {
        id: "pack-dentist",
        name: "Dentist Pack",
        category: "dentists",
        icon: "🦷",
        color: "#0ea5e9",
        tagline: "Reception AI with booking & patient CRM",
        description:
            "Mia (Reception AI), appointment booking workflow, patient CRM templates, and treatment FAQs for dental practices.",
        version: "1.0.0",
        author: "ZiricAI",
        featured: true,
        installable: true,
        includes: ["1 AI Employee", "6 Knowledge Docs", "2 Workflows", "CRM Templates", "Analytics Seed", "2 Reports"],
        agents: [
            {
                name: "Mia (AI)",
                role: "receptionist",
                roleLabel: "Dental Receptionist",
                avatar: "🦷",
                personality: "friendly",
                greetingMessage:
                    "Hi! I'm Mia from the dental practice. I can help with appointments, treatments, and general questions. How can I help?",
                systemPrompt: `You are Mia, a friendly dental receptionist AI.
Help patients book, reschedule, or cancel appointments. Answer FAQs about cleanings, fillings, orthodontics, and emergency dental pain.
For medical emergencies or severe pain, advise calling the practice emergency line or visiting ER.
Never diagnose — recommend a consultation with the dentist.`,
            },
        ],
        knowledge: [
            {
                title: "Appointment Booking Guide",
                type: "manual",
                content:
                    "Standard slots: 30 min cleaning, 45 min filling, 60 min root canal. Mon–Fri 08:00–17:00, Sat 08:00–12:00. Confirm patient name, contact, and medical aid.",
            },
            {
                title: "FAQ — Teeth Cleaning & Check-up",
                type: "faq",
                content:
                    "Recommended every 6 months. Includes scale & polish and oral exam. Duration ~30 minutes. Medical aid often covers 2 per year.",
            },
            {
                title: "FAQ — Emergency Dental Pain",
                type: "faq",
                content:
                    "Same-day emergency slots for severe pain, swelling, or trauma. After hours: call emergency line. For life-threatening symptoms, go to ER first.",
            },
            {
                title: "FAQ — Braces & Orthodontics",
                type: "faq",
                content:
                    "Free orthodontic assessment for patients 12+. Treatment plans from 12–24 months. Payment plans available.",
            },
            {
                title: "Treatment Price Guide (Indicative)",
                type: "products",
                content:
                    "Cleaning from R650, filling from R850, extraction from R1200, crown from R8500. Final quote after examination. Medical aid rates may differ.",
            },
            {
                title: "POPIA & Patient Privacy",
                type: "policies",
                content:
                    "Patient records are confidential. We collect information only for treatment and billing. Consent required for sharing with specialists or medical aid.",
            },
        ],
        workflows: [
            {
                name: "Appointment Booking — WhatsApp",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Booking intent", "fa-solid fa-filter", {
                        keyword: "book|appointment|schedule|cleaning",
                    }),
                    wfNode("n3", "ai_action", "extract_entities", "Extract date & treatment", "fa-solid fa-tags", {
                        entities: ["date", "treatment"],
                    }),
                    wfNode("n4", "action", "reply", "Confirm slot options", "fa-solid fa-reply", {
                        template: "booking_slots",
                    }),
                    wfNode("n5", "action", "update_crm", "Stage — appointment pending", "fa-solid fa-address-book", {
                        stage: "appointment_pending",
                    }),
                ],
            },
            {
                name: "Emergency Triage",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Pain keywords", "fa-solid fa-filter", {
                        keyword: "pain|swelling|emergency|broken tooth",
                    }),
                    wfNode("n3", "action", "create_task", "Urgent callback", "fa-solid fa-list-check", {
                        title: "Emergency dental — callback ASAP",
                        priority: "high",
                    }),
                    wfNode("n4", "action", "assign_human", "Alert on-call dentist", "fa-solid fa-user-tie", {
                        department: "Clinical",
                    }),
                ],
            },
        ],
        crmTemplates: {
            label: "Dental Patient CRM",
            stages: ["new_patient", "appointment_pending", "confirmed", "in_treatment", "follow_up"],
            fields: [
                { key: "medicalAid", label: "Medical Aid", type: "text" },
                { key: "lastVisit", label: "Last Visit", type: "date" },
                { key: "treatmentInterest", label: "Treatment Interest", type: "text" },
                { key: "preferredSlot", label: "Preferred Slot", type: "text" },
            ],
            defaultTags: ["dental", "patient"],
        },
        analytics: {
            satisfaction: 96,
            conversations: 28,
            messages: 112,
            leadScoreAvg: 65,
            metrics: ["bookings", "no_shows", "emergency_triage"],
        },
        reports: [
            { id: "rpt-dental-daily", name: "Daily Appointment Summary", type: "daily_summary" },
            { id: "rpt-dental-treatments", name: "Treatment Enquiries Report", type: "pipeline" },
        ],
    },
    {
        id: "pack-automotive-ai",
        name: "Automotive AI",
        category: "automotive",
        icon: "🚗",
        color: "#2563eb",
        tagline: "Central Motors–aligned sales & service AI",
        description:
            "Sarah (Sales Consultant AI), finance & test-drive workflows, vehicle CRM, and catalogue FAQs — aligned with Central Motors demo tenant.",
        version: "1.0.0",
        author: "ZiricAI",
        featured: true,
        installable: true,
        includes: ["1 AI Employee", "6 Knowledge Docs", "3 Workflows", "CRM Templates", "Analytics Seed", "2 Reports"],
        agents: [
            {
                name: "Sarah (AI)",
                role: "sales_consultant",
                roleLabel: "Sales Consultant",
                avatar: "🚗",
                personality: "sales_driven",
                greetingMessage:
                    "Hi! I'm Sarah. Looking for your next vehicle? I can help with models, finance, test drives, and trade-ins.",
                systemPrompt: `You are Sarah, a knowledgeable automotive sales consultant (Central Motors style).
Help with vehicle enquiries, finance, test drives, trade-ins, and service bookings.
Share accurate pricing from the knowledge base. Be enthusiastic but never pushy.
Escalate complex finance or legal questions to a human consultant.`,
            },
        ],
        knowledge: [
            {
                title: "Vehicle Catalogue 2025",
                type: "products",
                content:
                    "Toyota Hilux 2.4 GD-6 from R549,900. Toyota Corolla Cross from R389,900. Suzuki Swift from R219,900. Isuzu D-Max from R479,900. Stock varies — confirm availability.",
            },
            {
                title: "Finance Terms & Deposit Guide",
                type: "faq",
                content:
                    "Minimum deposit 10% on new vehicles. Terms 12–72 months. Balloon options available. Subject to credit approval by registered NCR credit providers.",
            },
            {
                title: "FAQ — Test Drive Booking",
                type: "faq",
                content:
                    "Book Mon–Sat 08:00–17:00. Bring valid driver's licence and proof of address. Test drives ~30 minutes on approved routes.",
            },
            {
                title: "FAQ — Trade-in Valuation",
                type: "faq",
                content:
                    "Send photos (front, rear, interior, odometer) and registration details. Preliminary valuation within 24h. Final offer after physical inspection.",
            },
            {
                title: "Service & Maintenance Intervals",
                type: "services",
                content:
                    "Major service every 15,000 km or 12 months. Express service from R1,899. Free multi-point inspection with every service.",
            },
            {
                title: "Business Hours",
                type: "faq",
                content: "Sales: Mon–Fri 08:00–18:00, Sat 08:00–14:00. Service: Mon–Fri 07:30–17:00. Closed Sundays and public holidays.",
            },
        ],
        workflows: [
            {
                name: "Finance Enquiry",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Finance keywords", "fa-solid fa-filter", {
                        keyword: "finance|deposit|monthly|balloon",
                    }),
                    wfNode("n3", "ai_action", "generate_proposal", "AI Finance Proposal", "fa-solid fa-wand-magic-sparkles", {
                        template: "vehicle_finance",
                    }),
                    wfNode("n4", "action", "create_task", "Finance follow-up", "fa-solid fa-list-check", {
                        title: "Finance enquiry follow-up",
                        priority: "high",
                    }),
                ],
            },
            {
                name: "Test Drive Booking",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Test drive", "fa-solid fa-filter", {
                        keyword: "test drive|drive the",
                    }),
                    wfNode("n3", "ai_action", "extract_entities", "Extract vehicle & date", "fa-solid fa-tags", {
                        entities: ["vehicle", "date"],
                    }),
                    wfNode("n4", "action", "reply", "Booking confirmation", "fa-solid fa-reply", {
                        template: "test_drive_confirmation",
                    }),
                ],
            },
            {
                name: "Service Reminder",
                nodes: [
                    wfNode("n1", "trigger", "scheduled", "Scheduled Trigger", "fa-solid fa-calendar-days", {
                        cron: "0 9 * * 1",
                    }),
                    wfNode("n2", "condition", "lead_score", "Due for service", "fa-solid fa-gauge-high", {
                        field: "daysSinceService",
                        operator: "gte",
                        value: 180,
                    }),
                    wfNode("n3", "action", "reply", "Service reminder", "fa-solid fa-reply", {
                        template: "service_reminder",
                    }),
                ],
            },
        ],
        crmTemplates: {
            label: "Automotive Sales CRM",
            stages: ["enquiry", "test_drive", "finance_application", "negotiation", "sold", "service_due"],
            fields: [
                { key: "vehicleInterest", label: "Vehicle Interest", type: "text" },
                { key: "budget", label: "Budget", type: "currency" },
                { key: "tradeIn", label: "Trade-in Vehicle", type: "text" },
                { key: "financeRequired", label: "Finance Required", type: "boolean" },
            ],
            defaultTags: ["automotive", "sales"],
        },
        analytics: {
            satisfaction: 97,
            conversations: 42,
            messages: 168,
            leadScoreAvg: 78,
            metrics: ["test_drives", "finance_enquiries", "trade_ins"],
        },
        reports: [
            { id: "rpt-auto-pipeline", name: "Sales Pipeline Report", type: "pipeline" },
            { id: "rpt-auto-finance", name: "Finance Enquiries Weekly", type: "weekly_summary" },
        ],
    },
    {
        id: "pack-estate-agent-ai",
        name: "Estate Agent AI",
        category: "real_estate",
        icon: "🏠",
        color: "#16a34a",
        tagline: INSTALL_TAGLINE,
        description:
            "Alex (Property Consultant AI), viewing scheduler, buyer/seller CRM, and suburb FAQ knowledge for agencies. " +
            INSTALL_TAGLINE + ".",
        version: "1.0.0",
        author: "ZiricAI",
        featured: true,
        installable: true,
        includes: ["1 AI Employee", "6 Knowledge Docs", "2 Workflows", "CRM Templates", "Analytics Seed", "2 Reports"],
        agents: [
            {
                name: "Alex (AI)",
                role: "sales_consultant",
                roleLabel: "Property Consultant",
                avatar: "🏠",
                personality: "professional",
                greetingMessage:
                    "Hi! I'm Alex. I can help you find properties, schedule viewings, or answer questions about our listings. What are you looking for?",
                systemPrompt: `You are Alex, a professional real estate consultant AI.
Help buyers and sellers with property enquiries, viewing bookings, bond pre-approval guidance, and suburb information.
Qualify leads: budget, bedrooms, area, timeline. Never guarantee sale prices or bond approval.
Offer to connect serious buyers with a human agent for offers and contracts.`,
            },
        ],
        knowledge: [
            {
                title: "Active Listings Snapshot",
                type: "products",
                content:
                    "Sample listings: 3-bed Sandton R2.4M, 2-bed Rosebank R1.65M, 4-bed Bryanston R3.8M, 1-bed Maboneng R890K. Updated weekly — confirm availability.",
            },
            {
                title: "FAQ — Viewing Appointments",
                type: "faq",
                content:
                    "Viewings Mon–Sun by appointment. Same-day slots subject to access. Bring ID. Tenants require 24h notice per lease.",
            },
            {
                title: "FAQ — Bond Pre-approval",
                type: "faq",
                content:
                    "Pre-approval strengthens offers. Typical deposit 10%. Affordability rule: bond repayment ≤ 30% gross income. We partner with major banks.",
            },
            {
                title: "Seller Guide — Listing Process",
                type: "manual",
                content:
                    "Valuation → mandate sign → photography → listing → show days → offers → transfer. Average sale timeline 8–12 weeks in current market.",
            },
            {
                title: "Suburb Guides — Gauteng",
                type: "manual",
                content:
                    "Sandton: premium, schools, corporate hub. Rosebank: mixed-use, walkable. Bryanston: family estates. Maboneng: urban loft lifestyle.",
            },
            {
                title: "Commission & Mandate Types",
                type: "policies",
                content:
                    "Sole mandate recommended for dedicated marketing. Commission per signed mandate. No upfront marketing fees on standard sole mandate.",
            },
        ],
        workflows: [
            {
                name: "Property Viewing Scheduler",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Viewing intent", "fa-solid fa-filter", {
                        keyword: "viewing|see the property|show me",
                    }),
                    wfNode("n3", "ai_action", "extract_entities", "Extract property & time", "fa-solid fa-tags", {
                        entities: ["property", "datetime"],
                    }),
                    wfNode("n4", "action", "reply", "Confirm viewing slot", "fa-solid fa-reply", {
                        template: "viewing_confirmation",
                    }),
                    wfNode("n5", "action", "update_crm", "Stage — viewing booked", "fa-solid fa-address-book", {
                        stage: "viewing_booked",
                    }),
                ],
            },
            {
                name: "Buyer Lead Qualification",
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", "Buying intent", "fa-solid fa-filter", {
                        keyword: "buy|looking for|bedroom|budget",
                    }),
                    wfNode("n3", "ai_action", "score_lead", "Qualify buyer", "fa-solid fa-gauge-high", {}),
                    wfNode("n4", "action", "create_task", "Agent follow-up", "fa-solid fa-list-check", {
                        title: "Qualified buyer — call within 2h",
                        priority: "medium",
                    }),
                ],
            },
        ],
        crmTemplates: {
            label: "Real Estate CRM",
            stages: ["new_lead", "qualified", "viewing_booked", "offer_stage", "sold", "rental"],
            fields: [
                { key: "budget", label: "Budget", type: "currency" },
                { key: "bedrooms", label: "Bedrooms", type: "number" },
                { key: "preferredSuburbs", label: "Preferred Suburbs", type: "text" },
                { key: "buyOrRent", label: "Buy or Rent", type: "select", options: ["Buy", "Rent", "Both"] },
            ],
            defaultTags: ["property", "buyer"],
        },
        analytics: {
            satisfaction: 95,
            conversations: 35,
            messages: 140,
            leadScoreAvg: 70,
            metrics: ["viewings", "qualified_leads", "listings_enquired"],
        },
        reports: [
            { id: "rpt-re-leads", name: "Weekly Lead Report", type: "weekly_summary" },
            { id: "rpt-re-viewings", name: "Viewings Pipeline", type: "pipeline" },
        ],
    },
    ...EMPLOYEE_AI_PACKS,
    { ...BASE_RECEPTIONIST_TEMPLATE, workflows: BASE_RECEPTIONIST_TEMPLATE.workflows },
];

/** Placeholder packs for categories without full demo content yet */
export const PLACEHOLDER_PACKS = [
    { id: "pack-hotels", name: "Hotel Concierge Pack", category: "hotels", icon: "🏨", installable: false, status: "coming_soon", author: "ZiricAI", version: "—" },
];

export function resolvePackId(packId) {
    return PACK_ALIASES[packId] || packId;
}

export function getPackById(packId) {
    const resolved = resolvePackId(packId);
    const direct = INDUSTRY_PACKS.find((p) => p.id === resolved);
    if (direct) return direct;
    /* fallback: legacy ID may still exist on pack object before alias rename */
    return INDUSTRY_PACKS.find((p) => p.id === packId) || null;
}

export function getCatalogPacks() {
    const full = INDUSTRY_PACKS.map((p) => {
        const manifest = buildPackManifest(p);
        return {
            id: manifest.id,
            canonicalId: manifest.canonicalId,
            name: manifest.name,
            category: manifest.category,
            legacyCategory: manifest.legacyCategory,
            icon: manifest.icon,
            color: manifest.color,
            tagline: manifest.tagline,
            description: manifest.description,
            version: manifest.version,
            latestVersion: manifest.latestVersion,
            author: manifest.author,
            featured: manifest.featured,
            installable: manifest.installable !== false,
            includes: manifest.includes,
            price: manifest.price,
            priceLabel: manifest.priceLabel,
            isFree: manifest.isFree,
            isPaid: manifest.isPaid,
            rating: manifest.rating,
            ratingCount: manifest.ratingCount,
            extends: manifest.extends,
            contents: manifest.contents,
            status: manifest.status || "available",
        };
    });
    const placeholders = PLACEHOLDER_PACKS.map((p) => ({
        ...p,
        tagline: "Coming soon",
        description: `${p.name} is on the ZiricAI roadmap.`,
        installable: false,
        status: "coming_soon",
    }));
    return [...full, ...placeholders];
}

export function getPacksByCategory(categoryId) {
    return getCatalogPacks().filter((p) => p.category === categoryId);
}

export function getMarketplaceCatalog(filters = {}) {
    let packs = getCatalogPacks();
    const { q, category, price, sort } = filters;

    if (q) {
        const query = String(q).toLowerCase();
        packs = packs.filter(
            (p) =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query) ||
                p.tagline?.toLowerCase().includes(query)
        );
    }
    if (category) {
        packs = packs.filter(
            (p) => p.category === category || p.legacyCategory === category
        );
    }
    if (price === "free") packs = packs.filter((p) => p.isFree);
    if (price === "paid") packs = packs.filter((p) => p.isPaid);

    if (sort === "rating") {
        packs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
        packs.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return {
        categories: MARKETPLACE_CATEGORIES,
        packs,
        thirdParty: THIRD_PARTY_REGISTRY,
        featured: packs.filter((p) => p.featured && p.installable),
    };
}
