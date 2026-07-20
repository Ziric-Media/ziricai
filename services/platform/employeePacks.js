/**
 * AI Employee marketplace packs — individual role-based installs.
 * Each pack: 1 agent, 2–3 knowledge docs, 1 workflow, CRM template seed.
 */
import { getPlan, formatPrice, getPublicPlans } from "./billingPlans.js";

const PACK_PRICING_BLURB =
    getPublicPlans()
        .map((plan) =>
            plan.price == null || plan.contactSales
                ? `${plan.label} (custom pricing)`
                : `${plan.label} from ${formatPrice(plan.price)}/mo`
        )
        .join(", ") +
    ". All plans include WhatsApp inbox, AI employees, and workflow automation.";

const wfNode = (id, type, stepType, label, icon, config = {}) => ({
    id,
    type,
    stepType,
    label,
    icon,
    config,
});

export const INSTALL_TAGLINE = "Installs in minutes — customize your knowledge base and branding";

function buildEmployeePack({
    id,
    name,
    category,
    icon,
    color,
    role,
    roleLabel,
    agentName,
    avatar,
    personality,
    greetingMessage,
    systemPrompt,
    knowledge,
    workflow,
    crm,
}) {
    return {
        id,
        name,
        category,
        icon,
        color,
        tagline: INSTALL_TAGLINE,
        description: `${agentName.replace(" (AI)", "")} — ${roleLabel}. ${INSTALL_TAGLINE}.`,
        version: "1.0.0",
        author: "ZiricAI",
        featured: true,
        installable: true,
        includes: ["1 AI Employee", "3 Knowledge Docs", "1 Workflow", "CRM Templates", "Analytics Seed"],
        agents: [
            {
                name: agentName,
                role,
                roleLabel,
                avatar: avatar || icon,
                personality,
                greetingMessage,
                systemPrompt,
            },
        ],
        knowledge,
        workflows: [
            {
                name: workflow.name,
                nodes: [
                    wfNode("n1", "trigger", "whatsapp_message", "WhatsApp Message", "fa-brands fa-whatsapp"),
                    wfNode("n2", "condition", "contains_keyword", workflow.label, "fa-solid fa-filter", {
                        keyword: workflow.keyword,
                    }),
                    wfNode("n3", "ai_action", "extract_entities", "Extract key details", "fa-solid fa-tags", {
                        entities: workflow.entities || ["intent", "priority"],
                    }),
                    wfNode("n4", "action", "reply", workflow.replyLabel || "Send reply", "fa-solid fa-reply", {
                        template: workflow.template || "acknowledgement",
                    }),
                    wfNode("n5", "action", "update_crm", "Update CRM stage", "fa-solid fa-address-book", {
                        stage: workflow.stage || "new_enquiry",
                    }),
                ],
            },
        ],
        crmTemplates: {
            label: crm.label,
            stages: crm.stages,
            fields: crm.fields,
            defaultTags: crm.tags,
        },
        analytics: {
            satisfaction: crm.satisfaction || 95,
            conversations: 18,
            messages: 72,
            leadScoreAvg: 64,
            metrics: crm.metrics || ["enquiries", "response_time"],
        },
        reports: [{ id: `rpt-${id}`, name: `${name} Weekly Summary`, type: "weekly_summary" }],
    };
}

/** Thirteen role-based employee packs (Funeral AI & Estate Agent AI live in main registry) */
export const EMPLOYEE_AI_PACKS = [
    buildEmployeePack({
        id: "pack-school-ai",
        name: "School AI",
        category: "schools",
        icon: "🎓",
        color: "#7c3aed",
        role: "receptionist",
        roleLabel: "School Receptionist",
        agentName: "Emma (AI)",
        personality: "warm",
        greetingMessage:
            "Hello! I'm Emma, the school receptionist. I can help with admissions, fees, events, and general enquiries. How may I assist you?",
        systemPrompt: `You are Emma, a friendly school receptionist AI.
Help parents and visitors with admissions enquiries, school fees, uniform orders, event schedules, and office hours.
Direct urgent safeguarding concerns to the designated safeguarding lead immediately.
Never share confidential student records — verify identity before discussing individual pupils.`,
        knowledge: [
            {
                title: "Admissions Process",
                type: "manual",
                content:
                    "Applications open Feb–Apr for the following academic year. Submit online form, birth certificate, latest report, and proof of residence. Assessment days in May.",
            },
            {
                title: "FAQ — School Fees & Payment",
                type: "faq",
                content:
                    "Term fees due by the 1st of each term. Payment plans available on request. Sibling discount 10%. Bursary applications close 30 November.",
            },
            {
                title: "School Calendar & Office Hours",
                type: "faq",
                content: "Office Mon–Fri 07:30–16:00. Term dates published on the website. After-hours messages answered next working day.",
            },
        ],
        workflow: {
            name: "Parent Enquiry Intake",
            label: "Admissions keywords",
            keyword: "admission|enrol|register|apply",
            entities: ["grade", "year"],
            template: "admissions_ack",
            stage: "admission_enquiry",
        },
        crm: {
            label: "School Enquiries CRM",
            stages: ["admission_enquiry", "assessment_booked", "offer_sent", "enrolled"],
            fields: [
                { key: "childName", label: "Child Name", type: "text" },
                { key: "gradeApplying", label: "Grade Applying", type: "text" },
                { key: "parentContact", label: "Parent Contact", type: "text" },
            ],
            tags: ["school", "parent"],
            metrics: ["admission_enquiries", "assessment_bookings"],
        },
    }),
    buildEmployeePack({
        id: "pack-law-ai",
        name: "Law Firm AI",
        category: "law",
        icon: "⚖️",
        color: "#b45309",
        role: "receptionist",
        roleLabel: "Law Firm Receptionist",
        agentName: "Victoria (AI)",
        personality: "professional",
        greetingMessage:
            "Good day. I'm Victoria, the law firm receptionist. I can assist with consultations, case updates, and document requests. How may I help?",
        systemPrompt: `You are Victoria, a professional law firm receptionist AI.
Schedule consultations, collect initial intake details, and answer general FAQs about practice areas and fees.
Never provide legal advice — clarify you are not an attorney and cannot interpret the law.
Escalate conflict checks and urgent court deadlines to a human paralegal.`,
        knowledge: [
            {
                title: "Practice Areas Overview",
                type: "manual",
                content:
                    "Family law, commercial contracts, property transfers, labour disputes, and estate planning. Initial consultation 30 minutes — fee applies unless noted on website.",
            },
            {
                title: "FAQ — Consultation Booking",
                type: "faq",
                content:
                    "Consultations Mon–Fri 09:00–17:00. Bring ID and relevant documents. Remote consultations available via secure video link.",
            },
            {
                title: "Client Intake Checklist",
                type: "policies",
                content:
                    "Full name, contact details, matter summary, opposing party (if any), urgency, and preferred appointment times. Conflict check required before engagement.",
            },
        ],
        workflow: {
            name: "Legal Consultation Booking",
            label: "Consultation intent",
            keyword: "consult|appointment|lawyer|legal advice",
            entities: ["practice_area", "urgency"],
            template: "consultation_slots",
            stage: "consultation_pending",
        },
        crm: {
            label: "Law Firm Intake CRM",
            stages: ["new_enquiry", "consultation_pending", "conflict_check", "retained", "closed"],
            fields: [
                { key: "practiceArea", label: "Practice Area", type: "text" },
                { key: "matterSummary", label: "Matter Summary", type: "text" },
                { key: "urgency", label: "Urgency", type: "select", options: ["Standard", "Urgent", "Court deadline"] },
            ],
            tags: ["legal", "client"],
            metrics: ["consultation_bookings", "intake_completions"],
        },
    }),
    buildEmployeePack({
        id: "pack-clinic-ai",
        name: "Clinic AI",
        category: "doctors",
        icon: "🩺",
        color: "#059669",
        role: "receptionist",
        roleLabel: "Medical Receptionist",
        agentName: "Nadia (AI)",
        personality: "caring",
        greetingMessage:
            "Hi, I'm Nadia from the medical practice. I can help with appointments, prescriptions, and general enquiries. How can I assist you today?",
        systemPrompt: `You are Nadia, a caring medical receptionist AI.
Book and reschedule appointments, answer FAQs about practice hours and services, and guide patients on repeat prescriptions.
Never diagnose or recommend treatment — advise patients to book a consultation for medical concerns.
For emergencies, instruct callers to dial emergency services or visit the nearest ER immediately.`,
        knowledge: [
            {
                title: "Appointment Booking Guide",
                type: "manual",
                content:
                    "Standard GP slots 15 minutes; extended 30 minutes. Confirm patient name, date of birth, medical aid, and reason for visit. Same-day slots for urgent cases when available.",
            },
            {
                title: "FAQ — Repeat Prescriptions",
                type: "faq",
                content:
                    "Repeat scripts require a recent consultation (within 6 months for chronic meds). Submit request via WhatsApp; ready for collection within 48 working hours.",
            },
            {
                title: "POPIA & Patient Privacy",
                type: "policies",
                content:
                    "Health information is confidential. Verify patient identity before discussing records. Consent required to share information with specialists or medical aid.",
            },
        ],
        workflow: {
            name: "Patient Appointment Booking",
            label: "Booking intent",
            keyword: "book|appointment|doctor|see the doctor",
            entities: ["date", "reason"],
            template: "medical_booking_slots",
            stage: "appointment_pending",
        },
        crm: {
            label: "Medical Practice CRM",
            stages: ["new_patient", "appointment_pending", "confirmed", "follow_up"],
            fields: [
                { key: "medicalAid", label: "Medical Aid", type: "text" },
                { key: "reasonForVisit", label: "Reason for Visit", type: "text" },
                { key: "preferredDate", label: "Preferred Date", type: "text" },
            ],
            tags: ["medical", "patient"],
            metrics: ["appointments_booked", "prescription_requests"],
        },
    }),
    buildEmployeePack({
        id: "pack-sales-ai",
        name: "Sales AI",
        category: "sales",
        icon: "💼",
        color: "#2563eb",
        role: "sales_consultant",
        roleLabel: "Sales Consultant",
        agentName: "Jordan (AI)",
        personality: "sales_driven",
        greetingMessage:
            "Hi! I'm Jordan, your sales assistant. I can help with product info, quotes, and next steps. What are you looking for today?",
        systemPrompt: `You are Jordan, an enthusiastic but respectful sales AI.
Qualify leads: need, budget, timeline, decision-maker. Share product info and pricing from the knowledge base.
Guide prospects toward demos or quotes without being pushy. Escalate complex negotiations to a human sales rep.`,
        knowledge: [
            {
                title: "Product Catalogue Overview",
                type: "products",
                content: PACK_PRICING_BLURB,
            },
            {
                title: "FAQ — Demo & Trial",
                type: "faq",
                content:
                    "14-day trial on Growth plan. Live demo slots Mon–Fri. Bring your use case — we tailor the walkthrough to your industry.",
            },
            {
                title: "Objection Handling Guide",
                type: "manual",
                content:
                    "Price: emphasise ROI and time saved. Competitors: focus on local support and industry packs. Timing: offer phased rollout starting with one AI employee.",
            },
        ],
        workflow: {
            name: "Sales Lead Qualification",
            label: "Buying intent",
            keyword: "price|quote|buy|demo|interested",
            entities: ["budget", "timeline"],
            template: "sales_follow_up",
            stage: "qualified_lead",
        },
        crm: {
            label: "Sales Pipeline CRM",
            stages: ["new_lead", "qualified_lead", "demo_scheduled", "proposal_sent", "won", "lost"],
            fields: [
                { key: "productInterest", label: "Product Interest", type: "text" },
                { key: "budget", label: "Budget", type: "currency" },
                { key: "timeline", label: "Timeline", type: "text" },
            ],
            tags: ["sales", "lead"],
            metrics: ["qualified_leads", "demos_booked"],
        },
    }),
    buildEmployeePack({
        id: "pack-customer-support-ai",
        name: "Customer Support AI",
        category: "support",
        icon: "🎧",
        color: "#0891b2",
        role: "support_agent",
        roleLabel: "Customer Support Agent",
        agentName: "Sam (AI)",
        personality: "helpful",
        greetingMessage:
            "Hi! I'm Sam from support. I can help with orders, account questions, and troubleshooting. What can I help you with?",
        systemPrompt: `You are Sam, a patient customer support AI.
Resolve common issues using the knowledge base: order status, returns, account access, and billing FAQs.
Acknowledge frustration, summarise the issue, and provide clear next steps. Escalate to a human agent when unresolved after two attempts.`,
        knowledge: [
            {
                title: "Returns & Refunds Policy",
                type: "policies",
                content:
                    "Returns within 30 days with proof of purchase. Refunds processed within 5–7 working days. Digital products non-refundable once activated.",
            },
            {
                title: "FAQ — Order Tracking",
                type: "faq",
                content:
                    "Track orders with order number via WhatsApp or portal. Standard delivery 3–5 working days; express 24–48 hours in major metros.",
            },
            {
                title: "Troubleshooting — Common Issues",
                type: "manual",
                content:
                    "Login: reset password via email link. Payment failed: check card limits or try alternate method. App not loading: clear cache and update to latest version.",
            },
        ],
        workflow: {
            name: "Support Ticket Intake",
            label: "Support keywords",
            keyword: "help|problem|issue|not working|refund",
            entities: ["issue_type", "order_id"],
            template: "support_ack",
            stage: "ticket_open",
        },
        crm: {
            label: "Support Tickets CRM",
            stages: ["ticket_open", "in_progress", "awaiting_customer", "resolved"],
            fields: [
                { key: "issueType", label: "Issue Type", type: "text" },
                { key: "orderId", label: "Order ID", type: "text" },
                { key: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"] },
            ],
            tags: ["support", "customer"],
            metrics: ["tickets_opened", "first_response_time"],
        },
    }),
    buildEmployeePack({
        id: "pack-appointment-ai",
        name: "Appointment AI",
        category: "scheduling",
        icon: "📅",
        color: "#6366f1",
        role: "scheduler",
        roleLabel: "Appointment Scheduler",
        agentName: "Ava (AI)",
        personality: "efficient",
        greetingMessage:
            "Hello! I'm Ava, your appointment assistant. I can book, reschedule, or cancel appointments. When would you like to come in?",
        systemPrompt: `You are Ava, an efficient appointment scheduling AI.
Offer available slots, confirm bookings, send reminders, and handle rescheduling or cancellations.
Always confirm date, time, contact details, and appointment type before finalising.`,
        knowledge: [
            {
                title: "Booking Rules & Slot Lengths",
                type: "manual",
                content:
                    "Standard appointments 30 min; consultations 45 min; follow-ups 15 min. Buffer 10 min between slots. Same-day booking subject to availability.",
            },
            {
                title: "FAQ — Cancellations & No-Shows",
                type: "faq",
                content:
                    "Cancel or reschedule at least 24 hours in advance. Late cancellations may incur a fee. Two no-shows require prepayment for future bookings.",
            },
            {
                title: "Business Hours",
                type: "faq",
                content: "Mon–Fri 08:00–17:00, Sat 09:00–13:00. Closed Sundays and public holidays.",
            },
        ],
        workflow: {
            name: "Appointment Booking Flow",
            label: "Scheduling intent",
            keyword: "book|schedule|appointment|reschedule|cancel",
            entities: ["datetime", "service_type"],
            template: "appointment_confirmation",
            stage: "appointment_pending",
        },
        crm: {
            label: "Appointments CRM",
            stages: ["appointment_pending", "confirmed", "completed", "cancelled"],
            fields: [
                { key: "serviceType", label: "Service Type", type: "text" },
                { key: "preferredSlot", label: "Preferred Slot", type: "text" },
                { key: "reminderSent", label: "Reminder Sent", type: "boolean" },
            ],
            tags: ["scheduling", "appointment"],
            metrics: ["bookings", "no_shows"],
        },
    }),
    buildEmployeePack({
        id: "pack-collections-ai",
        name: "Collections AI",
        category: "finance",
        icon: "💰",
        color: "#ca8a04",
        role: "collections_agent",
        roleLabel: "Collections Agent",
        agentName: "Riley (AI)",
        personality: "firm_friendly",
        greetingMessage:
            "Hello, I'm Riley from accounts. I can help with outstanding balances, payment plans, and account queries. How may I assist?",
        systemPrompt: `You are Riley, a firm but respectful collections AI.
Discuss outstanding invoices, offer payment plan options, and confirm payment arrangements.
Remain professional and compliant — no threats or harassment. Escalate disputes and hardship cases to a human accounts manager.`,
        knowledge: [
            {
                title: "Payment Plan Options",
                type: "policies",
                content:
                    "Plans over 3, 6, or 12 months for balances over R5,000. First instalment due within 7 days. Written agreement sent after verbal confirmation.",
            },
            {
                title: "FAQ — Invoice Queries",
                type: "faq",
                content:
                    "Invoice copies sent within 24 hours on request. Disputes must be logged within 14 days of invoice date with supporting documentation.",
            },
            {
                title: "Accepted Payment Methods",
                type: "faq",
                content: "EFT, card payment link, debit order, and cash at branch. Reference invoice number on all EFT payments.",
            },
        ],
        workflow: {
            name: "Payment Arrangement Intake",
            label: "Payment keywords",
            keyword: "pay|invoice|outstanding|balance|payment plan",
            entities: ["invoice_number", "amount"],
            template: "payment_plan_offer",
            stage: "payment_discussion",
        },
        crm: {
            label: "Collections CRM",
            stages: ["overdue", "payment_discussion", "plan_active", "resolved", "escalated"],
            fields: [
                { key: "invoiceNumber", label: "Invoice Number", type: "text" },
                { key: "amountDue", label: "Amount Due", type: "currency" },
                { key: "planTerms", label: "Plan Terms", type: "text" },
            ],
            tags: ["collections", "finance"],
            metrics: ["payment_plans", "recovery_rate"],
        },
    }),
    buildEmployeePack({
        id: "pack-hr-ai",
        name: "HR AI",
        category: "hr",
        icon: "👥",
        color: "#8b5cf6",
        role: "hr_assistant",
        roleLabel: "HR Assistant",
        agentName: "Taylor (AI)",
        personality: "supportive",
        greetingMessage:
            "Hi! I'm Taylor from HR. I can help with leave, policies, onboarding, and general HR enquiries. What do you need?",
        systemPrompt: `You are Taylor, a supportive HR assistant AI.
Answer FAQs about leave policies, benefits, payroll dates, and company handbook topics.
Handle sensitive matters with discretion — escalate harassment, disciplinary, or legal concerns to a human HR business partner immediately.`,
        knowledge: [
            {
                title: "Leave Policy Summary",
                type: "policies",
                content:
                    "Annual leave 15 days + public holidays. Sick leave per BCEA. Apply via HR portal 48 hours in advance where possible. Carry-over max 5 days with approval.",
            },
            {
                title: "FAQ — Onboarding Checklist",
                type: "faq",
                content:
                    "Day 1: ID, bank details, tax forms, IT setup. Week 1: policy acknowledgements and team intro. Buddy assigned for first 30 days.",
            },
            {
                title: "Payroll & Benefits",
                type: "manual",
                content:
                    "Salaries paid last working day of month. Medical aid and retirement fund enrolment within 30 days of start. Payslips available on employee portal.",
            },
        ],
        workflow: {
            name: "HR Enquiry Routing",
            label: "HR keywords",
            keyword: "leave|policy|payroll|onboarding|hr",
            entities: ["enquiry_type", "employee_id"],
            template: "hr_ack",
            stage: "hr_enquiry",
        },
        crm: {
            label: "HR Enquiries CRM",
            stages: ["hr_enquiry", "in_review", "resolved", "escalated"],
            fields: [
                { key: "enquiryType", label: "Enquiry Type", type: "text" },
                { key: "department", label: "Department", type: "text" },
                { key: "confidential", label: "Confidential", type: "boolean" },
            ],
            tags: ["hr", "employee"],
            metrics: ["hr_enquiries", "resolution_time"],
        },
    }),
    buildEmployeePack({
        id: "pack-recruitment-ai",
        name: "Recruitment AI",
        category: "hr",
        icon: "🎯",
        color: "#a855f7",
        role: "recruiter",
        roleLabel: "Recruitment Specialist",
        agentName: "Casey (AI)",
        personality: "engaging",
        greetingMessage:
            "Hello! I'm Casey from recruitment. I can share open roles, guide your application, and schedule interviews. Which position interests you?",
        systemPrompt: `You are Casey, an engaging recruitment AI.
Share open vacancies, collect CVs and basic screening answers, and schedule interview slots.
Be inclusive and professional. Do not guarantee outcomes — explain that hiring decisions rest with the hiring manager.`,
        knowledge: [
            {
                title: "Open Vacancies Snapshot",
                type: "products",
                content:
                    "Sales Consultant (JHB), Software Developer (Remote), Customer Support Lead (CPT), Marketing Coordinator (DBN). Updated weekly on careers page.",
            },
            {
                title: "FAQ — Application Process",
                type: "faq",
                content:
                    "Submit CV + cover letter via WhatsApp or careers portal. Screening within 5 working days. Interviews typically 2 rounds — virtual or in-person.",
            },
            {
                title: "Interview Preparation Guide",
                type: "manual",
                content:
                    "Research the company, prepare examples of relevant experience, and test video link beforehand. Arrive 10 minutes early for in-person interviews.",
            },
        ],
        workflow: {
            name: "Candidate Screening Intake",
            label: "Job application intent",
            keyword: "job|vacancy|apply|cv|resume|interview",
            entities: ["role", "experience"],
            template: "application_received",
            stage: "application_received",
        },
        crm: {
            label: "Recruitment Pipeline CRM",
            stages: ["application_received", "screening", "interview_scheduled", "offer", "hired", "rejected"],
            fields: [
                { key: "roleApplied", label: "Role Applied", type: "text" },
                { key: "experienceYears", label: "Years Experience", type: "number" },
                { key: "interviewSlot", label: "Interview Slot", type: "text" },
            ],
            tags: ["recruitment", "candidate"],
            metrics: ["applications", "interviews_scheduled"],
        },
    }),
    buildEmployeePack({
        id: "pack-insurance-ai",
        name: "Insurance AI",
        category: "insurance",
        icon: "🛡️",
        color: "#0369a1",
        role: "insurance_advisor",
        roleLabel: "Insurance Advisor",
        agentName: "Morgan (AI)",
        personality: "trustworthy",
        greetingMessage:
            "Hello! I'm Morgan, your insurance assistant. I can help with quotes, claims info, and policy questions. How can I help today?",
        systemPrompt: `You are Morgan, a trustworthy insurance advisor AI.
Explain cover types, collect quote details, and guide clients through claims intake FAQs.
Never bind cover or approve claims — final decisions rest with underwriters and assessors. Escalate complex claims to a human broker.`,
        knowledge: [
            {
                title: "Cover Types Overview",
                type: "manual",
                content:
                    "Short-term: vehicle, home, business. Life: funeral, disability, income protection. Commercial: liability, fleet, professional indemnity.",
            },
            {
                title: "FAQ — Claims Process",
                type: "faq",
                content:
                    "Report claims within 24–48 hours. Provide policy number, incident date, photos, and police case number (if applicable). Assessor contact within 2 working days.",
            },
            {
                title: "Quote Information Required",
                type: "faq",
                content:
                    "Vehicle: make, model, year, usage, parking. Home: address, contents value, security features. Business: turnover, staff count, industry.",
            },
        ],
        workflow: {
            name: "Insurance Quote Intake",
            label: "Quote intent",
            keyword: "quote|insurance|cover|premium|claim",
            entities: ["cover_type", "asset"],
            template: "quote_ack",
            stage: "quote_requested",
        },
        crm: {
            label: "Insurance Leads CRM",
            stages: ["quote_requested", "quote_sent", "policy_active", "claim_open"],
            fields: [
                { key: "coverType", label: "Cover Type", type: "text" },
                { key: "assetDetails", label: "Asset Details", type: "text" },
                { key: "claimNumber", label: "Claim Number", type: "text" },
            ],
            tags: ["insurance", "policy"],
            metrics: ["quotes_requested", "claims_logged"],
        },
    }),
    buildEmployeePack({
        id: "pack-restaurant-ai",
        name: "Restaurant AI",
        category: "restaurants",
        icon: "🍽️",
        color: "#dc2626",
        role: "host",
        roleLabel: "Restaurant Host",
        agentName: "Luca (AI)",
        personality: "welcoming",
        greetingMessage:
            "Welcome! I'm Luca. I can help with table reservations, menu questions, and special requests. How may I assist you?",
        systemPrompt: `You are Luca, a welcoming restaurant host AI.
Take table reservations, answer menu and dietary FAQs, and note special occasions or allergies.
Confirm party size, date, time, and contact number for every booking.`,
        knowledge: [
            {
                title: "Reservation Policy",
                type: "policies",
                content:
                    "Tables held 15 minutes past booking time. Groups 8+ require deposit. Cancel at least 4 hours ahead to avoid fee. Outdoor seating weather-dependent.",
            },
            {
                title: "FAQ — Menu & Dietary Options",
                type: "faq",
                content:
                    "Vegetarian, vegan, and gluten-free options marked on menu. Halal and kosher meals available on 24h notice. Kids menu for under 12.",
            },
            {
                title: "Opening Hours & Location",
                type: "faq",
                content: "Lunch Tue–Sun 12:00–15:00, Dinner Tue–Sat 18:00–22:00. Closed Mondays. Parking available on-site.",
            },
        ],
        workflow: {
            name: "Table Reservation Booking",
            label: "Reservation intent",
            keyword: "book|table|reservation|dinner|lunch",
            entities: ["party_size", "datetime"],
            template: "reservation_confirmation",
            stage: "reservation_pending",
        },
        crm: {
            label: "Restaurant Reservations CRM",
            stages: ["reservation_pending", "confirmed", "seated", "completed", "no_show"],
            fields: [
                { key: "partySize", label: "Party Size", type: "number" },
                { key: "occasion", label: "Occasion", type: "text" },
                { key: "dietaryNotes", label: "Dietary Notes", type: "text" },
            ],
            tags: ["restaurant", "guest"],
            metrics: ["reservations", "no_shows"],
        },
    }),
    buildEmployeePack({
        id: "pack-construction-ai",
        name: "Construction AI",
        category: "construction",
        icon: "🏗️",
        color: "#ea580c",
        role: "estimator",
        roleLabel: "Construction Estimator",
        agentName: "Derek (AI)",
        personality: "practical",
        greetingMessage:
            "Hi! I'm Derek from the construction team. I can help with quotes, project enquiries, and site visit scheduling. What project are you planning?",
        systemPrompt: `You are Derek, a practical construction estimator AI.
Collect project scope, location, timeline, and budget range for renovation or build enquiries.
Provide indicative guidance from the knowledge base — formal quotes require a site visit and human estimator sign-off.`,
        knowledge: [
            {
                title: "Services Offered",
                type: "manual",
                content:
                    "Residential builds, extensions, kitchen/bathroom renovations, roofing, and commercial fit-outs. NHBRC registered for new builds.",
            },
            {
                title: "FAQ — Quote Process",
                type: "faq",
                content:
                    "Initial desk quote from plans/photos within 48h. Site visit R850 (credited on acceptance). Detailed quote valid 30 days.",
            },
            {
                title: "Project Timeline Guide",
                type: "faq",
                content:
                    "Bathroom reno 2–3 weeks, kitchen 4–6 weeks, full house build 8–14 months depending on size and approvals.",
            },
        ],
        workflow: {
            name: "Construction Lead Intake",
            label: "Project enquiry",
            keyword: "quote|build|renovation|construction|extension",
            entities: ["project_type", "location"],
            template: "construction_ack",
            stage: "quote_enquiry",
        },
        crm: {
            label: "Construction Leads CRM",
            stages: ["quote_enquiry", "site_visit_booked", "quote_sent", "project_active", "complete"],
            fields: [
                { key: "projectType", label: "Project Type", type: "text" },
                { key: "location", label: "Location", type: "text" },
                { key: "budgetRange", label: "Budget Range", type: "text" },
            ],
            tags: ["construction", "lead"],
            metrics: ["quote_enquiries", "site_visits"],
        },
    }),
    buildEmployeePack({
        id: "pack-security-ai",
        name: "Security AI",
        category: "security",
        icon: "🛡️",
        color: "#0369a1",
        role: "security_coordinator",
        roleLabel: "Security Coordinator",
        agentName: "Blake (AI)",
        personality: "alert",
        greetingMessage:
            "Hello, I'm Blake from security operations. I can help with access control, incident reporting, and patrol schedules. How can I assist?",
        systemPrompt: `You are Blake, a professional security operations AI.
Handle access requests, visitor logging, incident reports, and patrol schedule FAQs.
For emergencies or active threats, instruct callers to contact emergency services immediately and alert on-site security.`,
        knowledge: [
            {
                title: "Visitor Access Procedures",
                type: "manual",
                content:
                    "All visitors must sign in at reception. Photo ID required. Pre-register contractors 24h in advance. Escort required in restricted zones.",
            },
            {
                title: "FAQ — Incident Reporting",
                type: "faq",
                content:
                    "Report incidents via WhatsApp or emergency line. Include location, time, description, and witnesses. Critical incidents escalated within 5 minutes.",
            },
            {
                title: "FAQ — Patrol Schedules",
                type: "faq",
                content:
                    "Perimeter patrols every 2 hours. Night shift increased frequency. CCTV monitoring 24/7. Report anomalies to control room immediately.",
            },
        ],
        workflow: {
            name: "Incident Report Intake",
            label: "Incident keywords",
            keyword: "incident|alarm|breach|suspicious|emergency",
            entities: ["location", "severity"],
            template: "incident_ack",
            stage: "incident_open",
        },
        crm: {
            label: "Security Operations CRM",
            stages: ["incident_open", "investigating", "resolved", "escalated"],
            fields: [
                { key: "incidentType", label: "Incident Type", type: "text" },
                { key: "location", label: "Location", type: "text" },
                { key: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High", "Critical"] },
            ],
            tags: ["security", "incident"],
            metrics: ["incidents_reported", "response_time"],
        },
    }),
    buildEmployeePack({
        id: "pack-retail-ai",
        name: "Retail AI",
        category: "retail",
        icon: "🛒",
        color: "#16a34a",
        role: "retail_assistant",
        roleLabel: "Retail Sales Assistant",
        agentName: "Skye (AI)",
        personality: "friendly",
        greetingMessage:
            "Hi! I'm Skye. I can help with product availability, store hours, orders, and returns. What are you looking for today?",
        systemPrompt: `You are Skye, a friendly retail sales assistant AI.
Help shoppers find products, check stock, process order enquiries, and explain return policies.
Upsell thoughtfully based on customer needs. Escalate complex complaints to a store manager.`,
        knowledge: [
            {
                title: "Store Hours & Locations",
                type: "faq",
                content:
                    "Mon–Sat 09:00–19:00, Sun 10:00–17:00. Click-and-collect available at all stores. Free parking at flagship location.",
            },
            {
                title: "FAQ — Returns & Exchanges",
                type: "faq",
                content:
                    "Returns within 30 days with receipt. Exchanges on unworn items with tags. Online orders: free returns via portal or in-store.",
            },
            {
                title: "Product Catalogue Highlights",
                type: "products",
                content:
                    "Seasonal sale up to 40% off selected lines. New arrivals weekly. Loyalty members earn 1 point per R10 spent.",
            },
        ],
        workflow: {
            name: "Product Enquiry & Order",
            label: "Shopping intent",
            keyword: "buy|order|stock|price|available|size",
            entities: ["product", "size"],
            template: "retail_product_info",
            stage: "product_enquiry",
        },
        crm: {
            label: "Retail Customer CRM",
            stages: ["product_enquiry", "order_placed", "shipped", "return_requested"],
            fields: [
                { key: "productInterest", label: "Product Interest", type: "text" },
                { key: "orderNumber", label: "Order Number", type: "text" },
                { key: "loyaltyMember", label: "Loyalty Member", type: "boolean" },
            ],
            tags: ["retail", "shopper"],
            metrics: ["product_enquiries", "orders_assisted"],
        },
    }),
    buildEmployeePack({
        id: "pack-church-ai",
        name: "Church AI",
        category: "churches",
        icon: "⛪",
        color: "#9333ea",
        role: "community_coordinator",
        roleLabel: "Church Community Coordinator",
        agentName: "Faith (AI)",
        personality: "compassionate",
        greetingMessage:
            "Peace be with you! I'm Faith, the church community assistant. I can help with service times, events, and pastoral enquiries. How may I serve you?",
        systemPrompt: `You are Faith, a compassionate church community coordinator AI.
Share service times, event schedules, and ministry information. Route pastoral care and prayer requests appropriately.
Speak with warmth and respect for all backgrounds. Escalate crisis or counselling needs to a human pastor immediately.`,
        knowledge: [
            {
                title: "Service Times & Locations",
                type: "manual",
                content:
                    "Sunday services 08:00 and 10:30. Midweek prayer Wed 18:00. Youth Friday 19:00. Main campus and satellite venue — directions on website.",
            },
            {
                title: "FAQ — Events & Ministries",
                type: "faq",
                content:
                    "Alpha course monthly, women's fellowship 1st Sat, men's breakfast quarterly. RSVP via WhatsApp for catering. All welcome.",
            },
            {
                title: "Pastoral Care & Prayer Requests",
                type: "policies",
                content:
                    "Prayer chain Mon–Sat. Pastoral visits by appointment. Crisis line for members 24/7 — connect to duty pastor. Confidentiality honoured.",
            },
        ],
        workflow: {
            name: "Church Enquiry & Event RSVP",
            label: "Church enquiry",
            keyword: "service|event|prayer|pastor|visit",
            entities: ["enquiry_type", "event"],
            template: "church_welcome",
            stage: "community_enquiry",
        },
        crm: {
            label: "Church Community CRM",
            stages: ["community_enquiry", "event_rsvp", "pastoral_follow_up", "connected"],
            fields: [
                { key: "enquiryType", label: "Enquiry Type", type: "text" },
                { key: "eventInterest", label: "Event Interest", type: "text" },
                { key: "prayerRequest", label: "Prayer Request", type: "text" },
            ],
            tags: ["church", "community"],
            metrics: ["enquiries", "event_rsvps"],
        },
    }),
];

/** Pack IDs the user requested — used for catalog filtering / verification */
export const REQUESTED_EMPLOYEE_PACK_IDS = [
    "pack-school-ai",
    "pack-law-ai",
    "pack-clinic-ai",
    "pack-sales-ai",
    "pack-receptionist-ai",
    "pack-restaurant-ai",
    "pack-construction-ai",
    "pack-church-ai",
    "pack-security-ai",
    "pack-retail-ai",
    /* legacy aliases still resolve */
    "pack-school-receptionist",
    "pack-law-receptionist",
    "pack-medical-receptionist",
    "pack-customer-support-ai",
    "pack-appointment-ai",
    "pack-collections-ai",
    "pack-hr-ai",
    "pack-recruitment-ai",
    "pack-estate-agent-ai",
    "pack-insurance-ai",
    "pack-funeral-ai",
];
