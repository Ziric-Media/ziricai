#!/usr/bin/env node
/**
 * Generate knowledge/01_About_ZiricAI.md — Module 01 Section A (Introduction) v1.0
 * Run: node scripts/generate-about-v1-section-a.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "knowledge/01_About_ZiricAI.md");

const HEADER = `# ZIRICAI KNOWLEDGE BASE v1.0 | MODULE 01: ABOUT ZIRICAI | SECTION 1: INTRODUCTION
> Official platform documentation — single source of truth for Sarah and AI employees
> Module target: 300 entries | Section A target: 80 entries | Last generated: 2026-07-24

`;

function fmt(entry) {
    const lines = [
        "---",
        `id: ${entry.id}`,
        `category: About ZiricAI`,
        `sub_category: ${entry.sub || "Introduction"}`,
        `difficulty: ${entry.diff || "Beginner"}`,
    ];
    if (entry.intent) lines.push(`intent: ${entry.intent}`);
    lines.push("keywords:");
    for (const k of entry.kw || ["ZiricAI"]) lines.push(`  - ${k}`);
    lines.push("audience:");
    for (const a of entry.aud || ["General", "Prospects", "Customers", "Partners", "Sales"]) lines.push(`  - ${a}`);
    if (entry.style) lines.push(`ai_response_style: "${entry.style.replace(/"/g, '\\"')}"`);
    lines.push(`last_updated: 2026-07-24`);
    lines.push("related:");
    for (const r of entry.rel || []) lines.push(`  - ${r}`);
    lines.push("---", "", `## Q: ${entry.q}`, "", `**A:** ${entry.a}`, "");
    return lines.join("\n");
}

/** User-provided entries KB-ABOUT-0001 through KB-ABOUT-0014 — exact content */
const SECTION_A = [
    {
        id: "KB-ABOUT-0001",
        kw: ["ZiricAI", "AI Business Operating System", "AI BOS", "Artificial Intelligence", "Business Automation", "Digital Workforce"],
        q: "What is ZiricAI?",
        a: `ZiricAI is an AI Business Operating System (AI BOS) developed by Ziric Media that enables organizations to deploy intelligent AI employees across every department of their business. Unlike traditional AI chatbots that are designed primarily to answer questions, ZiricAI provides a unified platform where multiple specialized AI employees work together to automate customer service, sales, marketing, finance, human resources, operations, analytics, and other business functions.

Think about it this way: Microsoft created Windows as the operating system for computers. Google created Android as the operating system for smartphones. Salesforce became the platform that helps businesses manage customer relationships. Shopify became the platform that powers millions of online stores.

In the same way, ZiricAI is designed to become the AI operating system for businesses.

Rather than offering a single AI assistant, ZiricAI provides an ecosystem of intelligent AI employees that collaborate across departments, access company knowledge, automate workflows, connect to existing business systems, and assist customers and employees 24 hours a day.

By combining conversational AI, workflow automation, analytics, CRM capabilities, business integrations, and industry-specific intelligence into one platform, ZiricAI helps organizations increase productivity, improve customer experiences, reduce operational costs, and scale more effectively.`,
        rel: ["KB-ABOUT-0002", "KB-ABOUT-0003", "What are AI Employees?", "How does ZiricAI work?"],
        style: "For prospects and general audience: use simple business language and the operating-system analogy. For CEOs: emphasize strategic scale and department-wide impact. For developers: mention unified platform, integrations, and knowledge grounding without marketing fluff.",
    },
    {
        id: "KB-ABOUT-0002",
        kw: ["AI Business Operating System", "AI BOS", "platform", "coordination"],
        q: "What does AI Business Operating System (AI BOS) mean?",
        a: `An AI Business Operating System (AI BOS) is a unified platform that uses artificial intelligence to support and automate the core functions of a business. Instead of providing a single AI assistant for isolated tasks, an AI BOS coordinates multiple specialized AI employees that work together across departments such as customer service, sales, marketing, finance, human resources, operations, and executive management.

Just as an operating system coordinates the hardware and software on a computer, an AI Business Operating System coordinates AI employees, business data, workflows, integrations, and knowledge to help an organization operate more efficiently.

ZiricAI was built around this concept, giving businesses one intelligent platform from which AI can assist every department.`,
        rel: ["KB-ABOUT-0001", "KB-ABOUT-0009"],
    },
    {
        id: "KB-ABOUT-0003",
        kw: ["chatbot", "comparison", "AI BOS", "conversational AI"],
        q: "Is ZiricAI just another chatbot?",
        a: `No.

While ZiricAI includes powerful conversational AI capabilities, it is designed as a complete AI Business Operating System rather than a standalone chatbot.

Traditional chatbots generally focus on answering customer questions. ZiricAI goes much further by combining AI conversations with workflow automation, business intelligence, CRM capabilities, document understanding, analytics, task execution, and integrations with third-party business systems.

Instead of deploying one chatbot, organizations can deploy multiple AI employees, each trained for a specific department or business function.`,
        rel: ["KB-ABOUT-0001", "KB-ABOUT-0006", "KB-ABOUT-0017"],
    },
    {
        id: "KB-ABOUT-0004",
        kw: ["origin", "purpose", "why created", "business challenges"],
        q: "Why was ZiricAI created?",
        a: `ZiricAI was created to help organizations embrace artificial intelligence in a practical and scalable way. Many businesses struggle with repetitive administrative work, increasing customer expectations, fragmented software systems, and limited staff capacity.

ZiricAI addresses these challenges by providing intelligent AI employees that can answer questions, automate workflows, assist customers, support employees, and integrate with existing business systems. The goal is not to replace people but to augment teams, allowing employees to focus on strategic and high-value work while AI handles repetitive tasks.`,
        rel: ["KB-ABOUT-0016", "KB-ABOUT-0024", "KB-ABOUT-0012"],
    },
    {
        id: "KB-ABOUT-0005",
        kw: ["audience", "target market", "industries", "SME", "enterprise"],
        q: "Who is ZiricAI designed for?",
        a: `ZiricAI is designed for organizations of all sizes, from startups and small businesses to large enterprises and public sector institutions.

The platform is suitable for industries including education, healthcare, legal services, retail, hospitality, financial services, churches, funeral services, manufacturing, logistics, government, construction, real estate, and many others.

Because ZiricAI uses modular AI employees, organizations can deploy only the capabilities they need today and expand over time as their requirements grow.`,
        rel: ["KB-ABOUT-0011", "KB-ABOUT-0013", "KB-ABOUT-0021"],
    },
    {
        id: "KB-ABOUT-0006",
        kw: ["traditional software", "comparison", "intelligent layer", "automation"],
        q: "How is ZiricAI different from traditional business software?",
        a: `Traditional business software is typically designed to perform specific functions, such as managing customer records, accounting, or employee information. Employees must manually operate these systems to complete tasks.

ZiricAI introduces an intelligent layer that sits across business operations. Instead of simply storing information, the platform understands requests, retrieves knowledge, automates workflows, performs actions, generates insights, and supports decision-making through specialized AI employees.

This allows organizations to move from software that simply records business activity to software that actively assists in running the business.`,
        rel: ["KB-ABOUT-0017", "KB-ABOUT-0027"],
    },
    {
        id: "KB-ABOUT-0007",
        kw: ["vision", "Africa", "digital workforce", "future"],
        q: "What vision drives ZiricAI?",
        a: `The vision of ZiricAI is to become the leading AI Business Operating System for organizations across Africa and beyond. By making advanced artificial intelligence accessible, secure, and practical, ZiricAI aims to empower businesses, institutions, and governments with intelligent digital workforces that improve efficiency, enhance customer experiences, and accelerate innovation.

The long-term goal is to enable every organization—regardless of size or industry—to benefit from AI employees that work alongside people to achieve better outcomes.`,
        rel: ["KB-ABOUT-0004", "KB-ABOUT-0028"],
    },
    {
        id: "KB-ABOUT-0008",
        sub: "Platform Overview",
        intent: "Platform Introduction",
        kw: ["AI Platform", "AI Business Operating System", "Business AI", "Automation", "Digital Workforce", "Business Software"],
        q: "What is the main purpose of ZiricAI?",
        a: `The primary purpose of ZiricAI is to help organizations operate more efficiently by providing intelligent AI employees that automate work, support employees, engage customers, and improve decision-making across every department.

Instead of using separate tools for customer support, sales, marketing, analytics, workflow automation, and knowledge management, organizations can use one unified AI platform that connects these functions together.

ZiricAI serves as the intelligent layer that sits on top of business operations, enabling AI to assist with day-to-day activities while employees focus on strategic and creative work.`,
        rel: ["KB-ABOUT-0010", "KB-ABOUT-0017", "KB-ABOUT-0005"],
        style: "Explain using simple business language. Avoid technical terminology unless requested. Highlight productivity and business growth.",
    },
    {
        id: "KB-ABOUT-0009",
        kw: ["AI BOS", "operating system", "orchestration", "ecosystem"],
        q: "Why is ZiricAI called an AI Business Operating System?",
        a: `The term "AI Business Operating System" reflects ZiricAI's role as the intelligent foundation for business operations.

Just as Windows manages the applications and hardware on a computer, and Android coordinates applications on a smartphone, ZiricAI coordinates AI employees, business knowledge, workflows, data, integrations, and automation across an organization.

Rather than acting as one chatbot, ZiricAI orchestrates multiple AI employees, each responsible for different business functions, while allowing them to collaborate and share information securely.

This creates a unified AI ecosystem capable of supporting the entire organization.`,
        rel: ["KB-ABOUT-0002", "KB-ABOUT-0001"],
    },
    {
        id: "KB-ABOUT-0010",
        kw: ["capabilities", "tasks", "automation", "AI employees"],
        q: "What does ZiricAI actually do?",
        a: `ZiricAI performs thousands of business tasks through intelligent AI employees.

These include answering customer enquiries, booking appointments, qualifying sales leads, following up prospects, sending quotations, processing customer requests, training new employees, managing company knowledge, producing reports, analysing customer conversations, creating marketing content, managing workflows, providing executive insights, supporting HR teams, managing help desk tickets, assisting finance departments, integrating with business software, and automating repetitive administrative work.

Rather than replacing existing systems, ZiricAI works alongside them to make people and processes more productive.`,
        rel: ["KB-ABOUT-0026", "KB-ABOUT-0025", "KB-ABOUT-0046"],
    },
    {
        id: "KB-ABOUT-0011",
        kw: ["small business", "SME", "Starter", "scale"],
        q: "Is ZiricAI suitable for small businesses?",
        a: `Yes.

ZiricAI is designed to scale from small businesses with only a few employees to multinational enterprises with thousands of staff members.

Small businesses often use ZiricAI to automate customer support, generate leads, answer frequently asked questions, schedule appointments, and manage customer relationships.

As the business grows, additional AI employees, workflows, and integrations can be added without changing platforms.

This allows organizations to start small while building toward a fully AI-enabled business.`,
        rel: ["KB-ABOUT-0005", "KB-ABOUT-0036"],
        style: "For small business owners: emphasize affordability, quick setup, and after-hours coverage. Avoid enterprise jargon.",
    },
    {
        id: "KB-ABOUT-0012",
        kw: ["replace employees", "augmentation", "productivity", "human workforce"],
        q: "Can ZiricAI replace human employees?",
        a: `No.

ZiricAI is designed to work alongside people rather than replace them.

AI employees are particularly effective at repetitive, time-consuming, and information-heavy tasks such as answering common questions, processing routine requests, organising knowledge, and automating workflows.

Human employees remain essential for leadership, creativity, relationship building, strategic decision-making, empathy, and complex problem solving.

The goal of ZiricAI is to increase productivity by allowing people to focus on high-value work while AI handles repetitive tasks.`,
        rel: ["KB-ABOUT-0004", "KB-ABOUT-0025", "KB-ABOUT-0053"],
        style: "Be reassuring and clear. Address job-loss concerns directly. Emphasize augmentation, not replacement.",
    },
    {
        id: "KB-ABOUT-0013",
        kw: ["industries", "verticals", "organizations", "modular"],
        q: "What types of organizations can use ZiricAI?",
        a: `ZiricAI is designed for organizations across virtually every industry.

Examples include schools, universities, hospitals, clinics, medical practices, churches, funeral homes, insurance companies, banks, retail stores, restaurants, hotels, real estate agencies, government departments, mining companies, construction companies, manufacturing businesses, logistics companies, law firms, accounting firms, NGOs, security companies, automotive dealerships, recruitment agencies, and professional services firms.

Because ZiricAI uses modular AI employees, each organization can customize the platform to suit its specific operational needs.`,
        rel: ["KB-ABOUT-0021", "KB-ABOUT-0005", "KB-ABOUT-0058"],
    },
    {
        id: "KB-ABOUT-0014",
        kw: ["knowledge", "training", "RAG", "documents", "customization"],
        q: "Does ZiricAI learn about my business?",
        a: `Yes.

ZiricAI can be trained using your organization's own knowledge, including documents, policies, frequently asked questions, operating procedures, product catalogues, employee manuals, price lists, websites, and other approved business information.

Once trained, AI employees use this knowledge to provide accurate, relevant, and consistent responses to customers and employees.

Organizations remain in control of their knowledge and can update it whenever business information changes.`,
        rel: ["KB-ABOUT-0039", "KB-ABOUT-0059", "KB-ABOUT-0060"],
        style: "For customers: emphasize control and accuracy. For developers: mention RAG, document ingestion, and knowledge base APIs.",
    },
];

/** Additional Section A entries 0015–0060 — detailed answers covering remaining introduction topics */
const SECTION_A_EXTENDED = [
    {
        id: "KB-ABOUT-0015",
        q: "Who developed ZiricAI?",
        kw: ["Ziric Media", "founders", "South Africa", "development team"],
        a: `ZiricAI was developed by Ziric Media, a South African technology company focused on making enterprise-grade artificial intelligence accessible to local and international businesses.

The product team combines experience in software engineering, customer experience design, and business automation. ZiricAI was built specifically to address the communication, compliance, and operational challenges faced by SMEs and growing organizations—particularly those that rely heavily on WhatsApp and need POPIA-aware data handling.

Rather than adapting generic international chatbot tools, ZiricAI was designed from the ground up as an AI Business Operating System with multi-channel routing, CRM, automation, and industry-specific intelligence built in.`,
        rel: ["KB-ABOUT-0004", "KB-ABOUT-0034"],
    },
    {
        id: "KB-ABOUT-0016",
        q: "What problem does ZiricAI solve?",
        kw: ["problems", "after-hours", "missed leads", "fragmented tools"],
        a: `ZiricAI solves the problem of businesses losing customers, leads, and productivity because they cannot respond fast enough—or at all—outside business hours.

Most SMEs face the same pattern: WhatsApp messages pile up overnight, staff repeat the same answers dozens of times, customer data sits in disconnected spreadsheets, and owners juggle five different tools that do not talk to each other.

ZiricAI consolidates customer conversations, knowledge, CRM, and automation into one AI-powered platform. AI employees answer from your approved content 24/7, capture leads automatically, route complex cases to humans, and give owners visibility through analytics—without requiring a dedicated IT team.`,
        rel: ["KB-ABOUT-0004", "KB-ABOUT-0024"],
        style: "For sales prospects: lead with pain points (missed WhatsApp leads, after-hours enquiries). For customers: focus on practical daily relief.",
    },
    {
        id: "KB-ABOUT-0017",
        q: "Why is ZiricAI different?",
        kw: ["differentiation", "unique", "grounded AI", "all-in-one"],
        a: `ZiricAI is different because it combines grounded AI conversations, workflow automation, CRM, analytics, multi-channel messaging, and industry packs in a single platform—rather than offering a standalone chatbot or a generic AI wrapper.

Three principles set it apart. First, answers come only from your approved Knowledge Base—not from the open internet—so customers receive accurate, on-brand responses. Second, AI employees have roles (reception, sales, support) with defined permissions and CRM context, not one anonymous bot. Third, the platform is built for African business realities: WhatsApp-first workflows, ZAR pricing, POPIA tooling, and industry packs for sectors like automotive, healthcare, and education.

This makes ZiricAI an operating system for business AI, not a widget you paste on a website.`,
        rel: ["KB-ABOUT-0006", "KB-ABOUT-0027", "KB-ABOUT-0035"],
    },
    {
        id: "KB-ABOUT-0018",
        q: "Is ZiricAI software?",
        kw: ["software", "SaaS", "platform", "application"],
        a: `Yes. ZiricAI is cloud-based business software delivered as a subscription service.

It includes a web-based Company Portal for administrators and staff, AI employee engines for customer-facing channels, a Knowledge Base manager, CRM, Automation Builder, Analytics dashboards, and integration connectors. Customers access the platform through a browser—no local installation is required for standard use.

ZiricAI is software in the same category as CRM and communication platforms, but with an AI-native architecture where intelligent agents are first-class citizens rather than add-ons.`,
        rel: ["KB-ABOUT-0019", "KB-ABOUT-0020"],
    },
    {
        id: "KB-ABOUT-0019",
        q: "Is ZiricAI cloud based?",
        kw: ["cloud", "SaaS", "hosting", "Firebase", "uptime"],
        a: `Yes. ZiricAI is a fully cloud-hosted platform.

Your AI employees, knowledge, CRM data, and automations run on secure cloud infrastructure with TLS 1.3 encryption in transit and AES-256 encryption at rest. Each company workspace (tenant) is isolated—your data never mixes with other organizations.

Cloud hosting means AI employees stay online 24/7 even when your office is closed, during load shedding (as long as customers have connectivity), and across multiple locations without server maintenance on your side.`,
        rel: ["KB-ABOUT-0020", "KB-ABOUT-0047"],
        style: "For developers: mention Firebase hosting, tenant isolation, encryption standards. For business users: emphasize always-on availability and no server management.",
    },
    {
        id: "KB-ABOUT-0020",
        q: "Can ZiricAI be installed locally?",
        kw: ["on-premise", "local installation", "self-hosted", "enterprise"],
        a: `Standard ZiricAI plans are cloud-hosted and accessed through the Company Portal in your browser. No local server installation is required for typical SME and mid-market deployments.

For enterprise customers with specific regulatory or infrastructure requirements, Ziric Media may discuss dedicated hosting or private cloud arrangements. Contact sales@ziricai.com to explore enterprise deployment options.

The cloud-first model ensures automatic updates, continuous security patches, and 24/7 AI availability without IT overhead.`,
        rel: ["KB-ABOUT-0019"],
        style: "For enterprise prospects: acknowledge on-premise questions and route to sales. For SMEs: confirm cloud is the standard and recommended path.",
    },
    {
        id: "KB-ABOUT-0021",
        q: "What industries use ZiricAI?",
        kw: ["industries", "verticals", "automotive", "healthcare", "education"],
        a: `ZiricAI serves organizations across dozens of industries, with dedicated industry packs and templates for many verticals.

Active sectors include automotive dealerships, healthcare and medical practices, schools and universities, legal firms, retail and e-commerce, restaurants and hospitality, churches and non-profits, funeral services, real estate, financial services, construction, logistics, government departments, and professional services.

Industry packs pre-load relevant FAQs, workflows, CRM fields, and AI employee configurations so businesses in each sector can go live faster with content that matches their operational language.`,
        rel: ["KB-ABOUT-0013", "KB-ABOUT-0058"],
    },
    {
        id: "KB-ABOUT-0022",
        q: "How does ZiricAI work?",
        kw: ["how it works", "setup", "onboarding", "workflow"],
        a: `ZiricAI works in four stages: configure, connect, train, and activate.

First, you create a company workspace and choose an industry pack or start from scratch. Second, you connect customer channels—WhatsApp, web chat, Facebook, Instagram, email, or SMS—through guided setup wizards. Third, you upload business knowledge: FAQs, policies, product catalogues, and price lists into the Knowledge Base. Fourth, you activate AI employees (reception, sales, support) that respond to customers using only your approved content.

Behind the scenes, retrieval-augmented generation (RAG) searches your knowledge before composing answers. CRM records are created automatically, automations trigger on events, and Sarah—your internal AI assistant—helps your team manage the platform.`,
        rel: ["KB-ABOUT-0030", "KB-ABOUT-0014", "KB-ABOUT-0029"],
        style: "Walk through the four steps clearly. For technical users: mention RAG and tenant architecture briefly.",
    },
    {
        id: "KB-ABOUT-0023",
        q: "What technologies power ZiricAI?",
        kw: ["technology stack", "Firebase", "OpenAI", "RAG", "architecture"],
        a: `ZiricAI is built on modern cloud-native technologies designed for security, scale, and AI performance.

The platform runs on Google Firebase with strict tenant isolation per company workspace. Large language models power conversational AI with retrieval-augmented generation (RAG) to ground answers in your Knowledge Base. The Automation Builder uses event-driven workflows connecting CRM, messaging channels, and external integrations via API and webhooks.

Security layers include TLS 1.3 in transit, AES-256 at rest, role-based access control, audit logging, and POPIA/GDPR compliance tooling. The architecture is multi-tenant SaaS—each organization's data, users, and AI employees are fully isolated.`,
        rel: ["KB-ABOUT-0019", "KB-ABOUT-0047"],
        style: "For developers: provide stack details. For business users: summarize as secure, modern, always-updated cloud platform.",
    },
    {
        id: "KB-ABOUT-0024",
        q: "Why should businesses use ZiricAI?",
        kw: ["business value", "ROI", "benefits", "competitive advantage"],
        a: `Businesses should use ZiricAI because customer expectations have changed—instant responses on WhatsApp and social channels are now the norm, but hiring enough staff to meet that demand around the clock is expensive and impractical for most SMEs.

ZiricAI delivers 24/7 customer engagement from your own approved content, captures leads that would otherwise be lost after hours, reduces repetitive work for existing staff, and provides CRM and analytics visibility that disconnected chatbots cannot offer.

Organizations that adopt ZiricAI typically see faster response times, higher lead conversion, lower cost per enquiry, and improved customer satisfaction—without replacing their existing team or rebuilding their tech stack from scratch.`,
        rel: ["KB-ABOUT-0025", "KB-ABOUT-0054", "KB-ABOUT-0008"],
        style: "For sales: lead with ROI and competitive urgency. For CEOs: frame as strategic operational upgrade.",
    },
    {
        id: "KB-ABOUT-0025",
        q: "How does ZiricAI improve productivity?",
        kw: ["productivity", "efficiency", "automation", "time savings"],
        a: `ZiricAI improves productivity by handling the high-volume, repetitive work that consumes staff time without adding proportional value.

AI employees answer common customer questions instantly—freeing agents for complex sales conversations and relationship building. Automations route enquiries, update CRM records, send follow-ups, and trigger notifications without manual data entry. Sarah helps internal teams configure the platform, find answers, and manage workflows without waiting for IT support.

Business owners report saving hours daily on WhatsApp triage alone. Teams redirect that time toward revenue-generating activities, strategic planning, and customer relationships that require human judgment and empathy.`,
        rel: ["KB-ABOUT-0012", "KB-ABOUT-0026", "KB-ABOUT-0010"],
    },
    {
        id: "KB-ABOUT-0026",
        q: "Can ZiricAI automate business tasks?",
        kw: ["automation", "workflows", "tasks", "triggers"],
        a: `Yes. ZiricAI includes a visual Automation Builder that lets you create workflows triggered by customer messages, CRM events, schedules, or external webhooks.

Automatable tasks include sending follow-up messages, assigning conversations to agents, updating CRM fields, tagging customers, sending email or SMS notifications, creating help desk tickets, qualifying leads, booking appointments, and posting data to external systems via API.

Automations run alongside AI employees—when a conversation requires human judgment, the workflow escalates to your team while AI continues handling routine cases. This combination of conversational AI and workflow automation is what distinguishes ZiricAI from simple chatbots.`,
        rel: ["KB-ABOUT-0010", "KB-ABOUT-0051"],
    },
    {
        id: "KB-ABOUT-0027",
        q: "What makes ZiricAI unique?",
        kw: ["unique", "differentiation", "competitive advantage", "AI BOS"],
        a: `What makes ZiricAI unique is its position as an AI Business Operating System—not a point solution.

While competitors offer chatbots, CRM tools, or automation platforms separately, ZiricAI unifies AI employees, grounded knowledge, CRM, multi-channel inbox, automation, analytics, industry packs, and an internal AI assistant (Sarah) in one tenant-isolated workspace.

Uniquely for the African market, ZiricAI is WhatsApp-first, POPIA-aware, priced in ZAR, and ships with industry-specific intelligence for sectors underserved by generic international tools. The platform Intelligence Library roadmap further extends this into sales scripts, training scenarios, and executive decision support—all from one authoritative source of truth.`,
        rel: ["KB-ABOUT-0017", "KB-ABOUT-0001"],
    },
    {
        id: "KB-ABOUT-0028",
        q: "What is the mission of ZiricAI?",
        kw: ["mission", "purpose", "accessibility", "SME"],
        a: `The mission of ZiricAI is to make enterprise-grade AI customer service and business automation accessible to every organization—regardless of size, industry, or technical capability.

Too many businesses are priced out of advanced AI or overwhelmed by complex integrations. ZiricAI removes those barriers with guided onboarding, industry packs, affordable ZAR pricing, and Sarah as an always-available setup assistant.

Every product decision is measured against this mission: can a business owner with no developers go live in under ten minutes and start capturing leads tonight? If the answer is yes, we are fulfilling our mission.`,
        rel: ["KB-ABOUT-0007", "KB-ABOUT-0004"],
    },
    {
        id: "KB-ABOUT-0029",
        q: "What is Sarah?",
        kw: ["Sarah", "AI Operating Assistant", "internal assistant", "onboarding"],
        a: `Sarah is ZiricAI's AI Operating Assistant—the internal AI that helps your team configure, manage, and operate the platform.

Unlike customer-facing AI employees who serve your clients on WhatsApp and web channels, Sarah works inside the Company Portal alongside your staff. She guides onboarding, connects integrations, searches the platform Knowledge Base, creates AI employees, uploads knowledge, and executes permitted platform actions through natural conversation.

Sarah draws from the same authoritative knowledge base documented here, ensuring consistent, accurate answers about ZiricAI features, pricing, setup, and best practices.`,
        rel: ["KB-ABOUT-0022", "KB-ABOUT-0031"],
        style: "Distinguish Sarah (internal) from AI Employees (customer-facing). For new users: emphasize Sarah guides setup step by step.",
    },
    {
        id: "KB-ABOUT-0030",
        q: "How fast can I go live with ZiricAI?",
        kw: ["go live", "setup time", "onboarding", "10 minutes"],
        a: `Most businesses go live with ZiricAI in under ten minutes when using an industry pack and following Sarah's onboarding wizard.

The typical path: create your account (2 minutes), connect WhatsApp or web chat (3 minutes), upload or confirm pre-loaded FAQs (3 minutes), and activate your first AI employee (2 minutes). Businesses with extensive custom knowledge or multiple channel integrations may take longer, but same-day launch is standard.

Sarah tracks your onboarding progress and surfaces the next step until your first AI employee is answering customer enquiries.`,
        rel: ["KB-ABOUT-0022", "KB-ABOUT-0032"],
    },
    {
        id: "KB-ABOUT-0031",
        q: "What channels does ZiricAI support?",
        kw: ["channels", "WhatsApp", "web chat", "Facebook", "Instagram", "omnichannel"],
        a: `ZiricAI supports omnichannel customer communication through a unified inbox.

Supported channels include WhatsApp Business API, website live chat widget, Facebook Messenger, Instagram Direct Messages, Telegram, email, and SMS. All conversations appear in one view with shared CRM profiles, conversation history, and agent assignment.

This means a customer who messages on WhatsApp and later visits your website is recognized as the same contact—with full context preserved across channels.`,
        rel: ["KB-ABOUT-0045", "KB-ABOUT-0022"],
    },
    {
        id: "KB-ABOUT-0032",
        q: "Do I need developers to use ZiricAI?",
        kw: ["developers", "no-code", "technical requirements", "setup"],
        a: `No. Standard ZiricAI setup requires no developers.

Sarah walks you through channel connection, knowledge upload, AI employee configuration, and automation creation using visual tools and guided wizards. Business owners, office managers, and customer service leads typically complete onboarding without writing code.

Developers are optional for advanced use cases: custom API integrations, webhook automations, and embedding the chat widget with specific styling. The REST API and developer documentation support these scenarios when technical resources are available.`,
        rel: ["KB-ABOUT-0030", "KB-ABOUT-0023"],
        style: "Reassure non-technical users first. Mention developer options only if audience is technical.",
    },
    {
        id: "KB-ABOUT-0033",
        q: "What is the Company Portal?",
        kw: ["Company Portal", "dashboard", "admin", "control centre"],
        a: `The Company Portal is your web-based control centre for everything in ZiricAI.

From the portal you manage AI employees, upload and edit Knowledge Base content, view the unified inbox, access CRM contacts and pipelines, build automations, review analytics, manage team roles, configure billing, and chat with Sarah.

The portal is responsive—use it on desktop during office hours or on mobile when you need to check conversations on the go. Each team member sees features appropriate to their role (owner, admin, agent, or viewer).`,
        rel: ["KB-ABOUT-0029", "KB-ABOUT-0044"],
    },
    {
        id: "KB-ABOUT-0034",
        q: "Where is ZiricAI based?",
        kw: ["South Africa", "headquarters", "Ziric Media", "local"],
        a: `ZiricAI is a South African technology product developed by Ziric Media.

The platform is built with local business realities in mind: WhatsApp as the primary customer channel, ZAR pricing, POPIA compliance tooling, and industry packs for sectors prominent in the South African economy.

While ZiricAI supports international customers, its design philosophy prioritizes accessibility and compliance for African businesses first—without compromising enterprise-grade security and capabilities.`,
        rel: ["KB-ABOUT-0015", "KB-ABOUT-0048"],
    },
    {
        id: "KB-ABOUT-0035",
        q: "How is ZiricAI different from ChatGPT?",
        kw: ["ChatGPT", "comparison", "grounded", "business context"],
        a: `ChatGPT is a general-purpose AI that answers from broad internet training data. ZiricAI is a business platform where AI employees answer exclusively from your approved Knowledge Base—with CRM context, channel routing, and workflow automation built in.

Key differences: ZiricAI never guesses from the open internet about your pricing, policies, or products. It creates CRM records, triggers automations, and routes conversations to humans when needed. It operates 24/7 on WhatsApp and social channels your customers already use—not in a separate chat window.

ChatGPT is excellent for general research. ZiricAI is purpose-built to represent your business accurately to customers and automate your operations.`,
        rel: ["KB-ABOUT-0017", "KB-ABOUT-0014"],
        style: "Avoid dismissing ChatGPT—acknowledge its strengths, then clarify ZiricAI's business-specific role.",
    },
    {
        id: "KB-ABOUT-0036",
        q: "Can ZiricAI work for solo entrepreneurs?",
        kw: ["solo", "entrepreneur", "freelancer", "Starter plan"],
        a: `Yes. The Starter plan is designed for owner-operators and solo entrepreneurs who cannot answer every WhatsApp message personally—especially after hours.

A solo entrepreneur can deploy one AI employee to handle FAQs, capture lead details, and schedule callbacks while they focus on delivery work. As the business grows, additional AI employees, channels, and automations can be added without migrating to a different platform.

Sarah guides solo users through minimal viable setup so they can start capturing leads tonight with only a phone and their existing FAQ document.`,
        rel: ["KB-ABOUT-0011", "KB-ABOUT-0005"],
    },
    {
        id: "KB-ABOUT-0037",
        q: "What is tenant isolation?",
        kw: ["tenant", "isolation", "security", "multi-tenant", "data separation"],
        a: `Tenant isolation means each company's data, users, knowledge, conversations, CRM records, and AI employees exist in a completely separate workspace.

No customer data, conversation history, or business knowledge crosses between tenants. Your AI employees only access your Knowledge Base. Your CRM only contains your contacts. Billing, analytics, and integrations are scoped to your organization.

This architecture is fundamental to ZiricAI's security model and POPIA compliance—ensuring your business information remains private and under your control.`,
        rel: ["KB-ABOUT-0047", "KB-ABOUT-0019"],
        style: "For developers: explain multi-tenant SaaS architecture. For business users: emphasize data privacy and separation.",
    },
    {
        id: "KB-ABOUT-0038",
        q: "Does ZiricAI support agencies?",
        kw: ["agency", "multi-client", "reseller", "partner"],
        a: `Yes. Marketing agencies, IT consultancies, and business service providers use ZiricAI to manage multiple client workspaces.

Each client gets an isolated Company Portal with separate knowledge, CRM, channels, and billing. Agency team members can be granted access across client accounts with appropriate roles.

Ziric Media also offers a partner programme for agencies that resell or implement ZiricAI—contact partners@ziricai.com for referral terms and white-label options on Enterprise plans.`,
        rel: ["KB-ABOUT-0050", "KB-ABOUT-0040"],
    },
    {
        id: "KB-ABOUT-0039",
        q: "What is RAG in ZiricAI?",
        kw: ["RAG", "retrieval-augmented generation", "knowledge grounding", "accuracy"],
        a: `RAG (Retrieval-Augmented Generation) is the technology ZiricAI uses to ensure AI employees answer from your business content—not from general internet knowledge.

When a customer asks a question, the system first searches your Knowledge Base for relevant document chunks and Q&A entries. It then composes a response grounded in those specific sources. If no matching content exists, the AI employee escalates or says it cannot answer—rather than inventing information.

This approach dramatically reduces hallucinations and ensures responses reflect your actual pricing, policies, and product details.`,
        rel: ["KB-ABOUT-0014", "KB-ABOUT-0059"],
        style: "For developers: explain retrieval pipeline. For business users: explain as 'AI searches your documents first, then answers.'",
    },
    {
        id: "KB-ABOUT-0040",
        q: "Can I white-label ZiricAI?",
        kw: ["white-label", "branding", "Enterprise", "partner"],
        a: `Enterprise plans support custom branding including your logo, colours, domain, and AI employee personas—presenting the platform under your brand to clients or internal teams.

Agency partners on Enterprise arrangements can deploy white-labelled workspaces for their clients. Standard plans include chat widget customization and AI employee naming but retain ZiricAI platform branding in the admin portal.

Contact sales@ziricai.com to discuss white-label requirements, custom domains, and partner pricing.`,
        rel: ["KB-ABOUT-0038"],
        style: "Route enterprise and agency inquiries to sales. Confirm basic branding is available on all plans.",
    },
    {
        id: "KB-ABOUT-0041",
        q: "Is ZiricAI suitable for load shedding in South Africa?",
        kw: ["load shedding", "uptime", "South Africa", "availability"],
        a: `Yes. Because ZiricAI is cloud-hosted, your AI employees continue responding to customers even when your office has no power—as long as customers have internet connectivity on their phones.

Your team accesses the Company Portal from any device with internet, including mobile data during outages. AI employees do not depend on your local servers, generators, or office Wi-Fi.

This is a significant advantage for South African businesses where load shedding routinely disrupts office operations but customers still expect instant WhatsApp responses.`,
        rel: ["KB-ABOUT-0019", "KB-ABOUT-0034"],
    },
    {
        id: "KB-ABOUT-0042",
        q: "Does ZiricAI require Meta Business verification?",
        kw: ["Meta", "WhatsApp Business API", "verification", "setup"],
        a: `Yes. Connecting WhatsApp Business API requires Meta Business verification—a standard requirement for all WhatsApp Business API providers, not unique to ZiricAI.

Sarah guides you through Meta Business Manager setup, phone number registration, and verification steps. Most verifications complete within a few business days. While verification is pending, you can still configure knowledge, CRM, and web chat channels.

Once verified, your AI employees can respond on WhatsApp 24/7 using approved message templates and session messages.`,
        rel: ["KB-ABOUT-0031", "KB-ABOUT-0030"],
    },
    {
        id: "KB-ABOUT-0043",
        q: "Can ZiricAI answer in multiple languages?",
        kw: ["multilingual", "languages", "Afrikaans", "isiZulu", "translation"],
        a: `Yes. When you provide multilingual content in your Knowledge Base, AI employees respond in the customer's language.

Supported configurations include English, Afrikaans, isiZulu, isiXhosa, Sesotho, and other South African languages—depending on the knowledge you upload. The AI detects the customer's language from their message and retrieves matching content.

For best results, upload FAQs and policies in each language you want supported. Mixed-language businesses (common in South Africa) can serve customers in their preferred language without hiring separate agents for each.`,
        rel: ["KB-ABOUT-0014", "KB-ABOUT-0034"],
    },
    {
        id: "KB-ABOUT-0044",
        q: "Is there a mobile app for ZiricAI?",
        kw: ["mobile", "app", "responsive", "browser"],
        a: `ZiricAI does not require a separate mobile app download. The Company Portal is fully responsive and works in mobile browsers on iOS and Android.

Your team can check conversations, respond to escalations, and manage settings from a phone browser. Customers interact with your AI employees on channels they already use—WhatsApp, Facebook, Instagram, and web chat—without installing anything.

This approach avoids app store friction and meets customers where they already communicate.`,
        rel: ["KB-ABOUT-0033", "KB-ABOUT-0031"],
    },
    {
        id: "KB-ABOUT-0045",
        q: "What is the unified inbox?",
        kw: ["unified inbox", "omnichannel", "conversations", "CRM context"],
        a: `The unified inbox brings all customer conversations from every connected channel into a single view inside the Company Portal.

WhatsApp, web chat, Facebook Messenger, Instagram DMs, email, and SMS threads appear together with the customer's CRM profile, conversation history, tags, and assigned agent. Staff no longer switch between apps to find context.

AI employees handle first-line responses; human agents take over seamlessly when escalation is needed—with full conversation history preserved.`,
        rel: ["KB-ABOUT-0031", "KB-ABOUT-0033"],
    },
    {
        id: "KB-ABOUT-0046",
        q: "What are AI Employees?",
        kw: ["AI Employees", "roles", "reception", "sales", "support"],
        a: `AI Employees are role-based AI agents deployed on your customer channels—each configured for a specific business function.

Standard roles include Reception (first-line enquiries and routing), Sales (lead qualification and follow-up), and Support (technical help and ticket management). Each AI Employee has its own name, tone, knowledge scope, channel assignments, and business hours.

Unlike a generic chatbot, AI Employees operate with CRM context, trigger automations, escalate to humans when appropriate, and report analytics on their performance. You can create custom roles beyond the standard presets.`,
        rel: ["KB-ABOUT-0001", "KB-ABOUT-0010", "KB-ABOUT-0029"],
    },
    {
        id: "KB-ABOUT-0047",
        q: "How does ZiricAI handle data security?",
        kw: ["security", "encryption", "TLS", "AES-256", "access control"],
        a: `ZiricAI implements enterprise-grade security across every layer of the platform.

Data in transit is protected by TLS 1.3. Data at rest is encrypted with AES-256. Each tenant workspace is isolated with strict access boundaries. Role-based permissions control who can view conversations, edit knowledge, or manage billing.

Audit trails log admin actions and integration changes. Regular security reviews and dependency updates maintain platform integrity. Detailed security documentation is available in the Security module of this Knowledge Base.`,
        rel: ["KB-ABOUT-0037", "KB-ABOUT-0048", "KB-ABOUT-0019"],
        style: "For security-conscious prospects: provide specific standards. For general users: summarize as bank-grade encryption and private workspaces.",
    },
    {
        id: "KB-ABOUT-0048",
        q: "Is ZiricAI POPIA compliant?",
        kw: ["POPIA", "compliance", "privacy", "South Africa", "data protection"],
        a: `ZiricAI is designed with POPIA (Protection of Personal Information Act) compliance as a core requirement—not an afterthought.

The platform provides tools for consent management, data subject access requests, retention policies, and secure processing of personal information. Tenant isolation ensures customer data is not shared across organizations. Data processing agreements are available for enterprise customers.

POPIA-specific guidance, policies, and procedures are documented in Module 20 of this Knowledge Base. Organizations remain responsible for their own compliance obligations, but ZiricAI provides the infrastructure and tooling to support them.`,
        rel: ["KB-ABOUT-0047", "KB-ABOUT-0034"],
    },
    {
        id: "KB-ABOUT-0049",
        q: "How is ZiricAI priced?",
        kw: ["pricing overview", "plans", "subscription", "ZAR"],
        a: `ZiricAI offers subscription plans priced in South African Rand (ZAR), starting with a 14-day free trial.

Plans include Starter (R999.99/month), Professional (R2,999/month), Business (R4,999/month), and Enterprise (custom pricing). Each tier adds AI employees, message limits, channels, team seats, and advanced features.

Detailed plan comparisons, feature matrices, and billing FAQs are documented in Module 02 (Pricing) of this Knowledge Base. Contact sales@ziricai.com for Enterprise quotes.`,
        rel: ["KB-PRICING-0001"],
        style: "Give overview only—direct detailed pricing questions to Module 02. Always use canonical prices from billingPlans.js.",
    },
    {
        id: "KB-ABOUT-0050",
        q: "Can I run multiple businesses on ZiricAI?",
        kw: ["multiple businesses", "tenants", "agency", "workspaces"],
        a: `Each business operates in its own isolated tenant workspace with separate knowledge, CRM, channels, users, and billing.

If you operate multiple businesses, create a separate account (tenant) for each. Agencies managing client businesses use separate tenants per client—ensuring complete data separation and independent billing.

There is no cross-tenant data sharing. This protects each business's customer information and allows independent configuration of AI employees and automations.`,
        rel: ["KB-ABOUT-0037", "KB-ABOUT-0038"],
    },
    {
        id: "KB-ABOUT-0051",
        q: "Does ZiricAI integrate with existing systems?",
        kw: ["integrations", "API", "webhooks", "third-party", "connectors"],
        a: `Yes. ZiricAI connects to existing business systems through native integrations, webhooks, and a REST API.

Supported integrations include WhatsApp Business API, Facebook, Instagram, email providers, SMS gateways, and calendar systems. The Automation Builder can POST events to external CRMs, ERPs, or custom endpoints via webhooks.

Developers can use the REST API for programmatic access to conversations, CRM, knowledge, and automations. Integration documentation is available in Modules 11 (Integrations) and 12 (API).`,
        rel: ["KB-ABOUT-0026", "KB-ABOUT-0023"],
        style: "For developers: mention API and webhooks. For business users: confirm it works alongside existing tools.",
    },
    {
        id: "KB-ABOUT-0052",
        q: "What is the ZiricAI Marketplace?",
        kw: ["Marketplace", "industry packs", "templates", "plugins"],
        a: `The ZiricAI Marketplace is a catalog of industry packs, workflow templates, knowledge starters, and integration connectors that accelerate deployment.

Industry packs bundle pre-built FAQs, CRM fields, automation workflows, and AI employee configurations for specific verticals—automotive, healthcare, education, legal, and more. Templates can be installed in minutes and customized with your business details.

The Marketplace grows continuously as new packs and integrations are published. Browse available packs from the Company Portal or ask Sarah for recommendations based on your industry.`,
        rel: ["KB-ABOUT-0058", "KB-ABOUT-0021"],
    },
    {
        id: "KB-ABOUT-0053",
        q: "How does ZiricAI compare to hiring additional staff?",
        kw: ["staff comparison", "cost", "ROI", "hiring", "24/7 coverage"],
        a: `Hiring staff for 24/7 customer coverage requires multiple shifts, training, management overhead, leave coverage, and office infrastructure—often costing R15,000–R25,000+ per month per role in South Africa.

ZiricAI Starter plan (R999.99/month) provides one AI employee available 24/7, handling unlimited routine enquiries from your approved knowledge, with CRM and analytics included. Professional and Business plans scale to multiple AI employees and channels.

AI employees do not replace human staff for complex sales, empathy, or leadership—but they eliminate the economic impossibility of 24/7 first-line coverage for most SMEs.`,
        rel: ["KB-ABOUT-0012", "KB-ABOUT-0054", "KB-ABOUT-0049"],
        style: "For sales: use concrete ZAR comparisons. Be honest that humans remain essential for high-value work.",
    },
    {
        id: "KB-ABOUT-0054",
        q: "What ROI can businesses expect from ZiricAI?",
        kw: ["ROI", "return on investment", "value", "metrics"],
        a: `ROI from ZiricAI typically comes from three measurable areas: captured leads, time savings, and improved conversion.

After-hours WhatsApp enquiries that previously went unanswered become qualified leads in CRM. Staff spend less time on repetitive FAQ responses—often saving 2–4 hours daily. Faster response times improve conversion rates on sales enquiries.

The marketing site includes ROI calculators. Many businesses report payback within the first month when previously lost after-hours leads are recovered. Exact ROI depends on enquiry volume, average deal value, and current response times.`,
        rel: ["KB-ABOUT-0024", "KB-ABOUT-0053"],
        style: "For sales prospects: use ROI framework with examples. Avoid guaranteeing specific numbers—use ranges and calculators.",
    },
    {
        id: "KB-ABOUT-0055",
        q: "Is training required to use ZiricAI?",
        kw: ["training", "learning curve", "onboarding", "tutorials"],
        a: `No formal training is required for standard ZiricAI use. Sarah provides guided onboarding that walks new users through setup step by step.

Most business owners and office managers become proficient within their first session. The platform uses familiar concepts—inbox, contacts, documents, settings—presented through an intuitive web interface.

Advanced features like complex automations, API integrations, and custom AI employee configurations have dedicated tutorials in Module 13. Sarah can also answer how-to questions by searching the platform Knowledge Base.`,
        rel: ["KB-ABOUT-0030", "KB-ABOUT-0029"],
    },
    {
        id: "KB-ABOUT-0056",
        q: "Can I invite my team to ZiricAI?",
        kw: ["team", "roles", "permissions", "collaboration"],
        a: `Yes. Invite team members from the Company Portal with role-based permissions.

Available roles include Owner (full access including billing), Admin (manage settings, knowledge, and AI employees), Agent (handle conversations and CRM), and Viewer (read-only analytics and reports). Plan limits determine the number of seats included.

Team collaboration ensures the right people handle escalations, manage knowledge updates, and review analytics—while Sarah helps any team member find answers about platform features.`,
        rel: ["KB-ABOUT-0033"],
    },
    {
        id: "KB-ABOUT-0057",
        q: "What support options does ZiricAI offer?",
        kw: ["support", "help", "SLA", "contact"],
        a: `ZiricAI provides multiple support channels depending on your plan.

All plans include Sarah (AI assistant) for instant platform help, email support at support@ziricai.com, and access to this Knowledge Base. Business plans add same-business-day email response. Enterprise plans include dedicated account management and custom SLAs.

Live chat is available in the Company Portal during business hours. For urgent WhatsApp integration issues, support prioritizes channel connectivity to minimize customer-facing downtime.`,
        rel: ["KB-ABOUT-0029", "KB-ABOUT-0055"],
    },
    {
        id: "KB-ABOUT-0058",
        q: "What is an industry pack?",
        kw: ["industry pack", "template", "vertical", "Marketplace"],
        a: `An industry pack is a pre-configured bundle of knowledge, CRM fields, automation workflows, and AI employee settings tailored to a specific business sector.

For example, an automotive dealership pack includes vehicle enquiry FAQs, test drive booking workflows, lead scoring for hot prospects, and sales AI employee presets. A healthcare pack includes appointment scheduling, POPIA consent flows, and patient enquiry handling.

Industry packs reduce setup time from days to minutes. Install from the Marketplace, customize with your business details, and go live the same day.`,
        rel: ["KB-ABOUT-0052", "KB-ABOUT-0021"],
    },
    {
        id: "KB-ABOUT-0059",
        q: "How does ZiricAI ensure answer accuracy?",
        kw: ["accuracy", "grounding", "hallucination", "quality control"],
        a: `ZiricAI ensures accuracy through retrieval-augmented generation (RAG), knowledge governance, and human oversight.

AI employees search your Knowledge Base before answering—never inventing pricing, policies, or product details. Administrators control exactly what content is approved. Incorrect responses can be flagged for review and knowledge updates.

Confidence thresholds and escalation rules route uncertain queries to human agents rather than guessing. Regular knowledge audits and analytics on unanswered questions help teams continuously improve content quality.`,
        rel: ["KB-ABOUT-0039", "KB-ABOUT-0014", "KB-ABOUT-0060"],
    },
    {
        id: "KB-ABOUT-0060",
        q: "What happens when ZiricAI cannot answer a question?",
        kw: ["escalation", "fallback", "human handoff", "unknown questions"],
        a: `When an AI employee cannot find a confident answer in your Knowledge Base, it follows your configured escalation rules rather than guessing.

Standard escalation paths include: notifying a human agent in the unified inbox, collecting the customer's contact details for callback, creating a help desk ticket, or providing a polite message that a team member will follow up.

Administrators can review unanswered or low-confidence conversations in analytics to identify knowledge gaps—then add missing FAQs to prevent future escalations. This feedback loop continuously improves AI performance.`,
        rel: ["KB-ABOUT-0059", "KB-ABOUT-0045"],
        style: "Reassure users that AI won't make things up. Explain escalation as a feature, not a failure.",
    },
];

/** Section B — Platform Features (migrated, enhanced) */
const SECTION_B = [
    {
        id: "KB-ABOUT-0061",
        sub: "Platform Features",
        diff: "Intermediate",
        aud: ["Customers", "Partners"],
        q: "What core features does ZiricAI include?",
        kw: ["features", "platform", "CRM", "automation", "analytics"],
        a: `ZiricAI includes a comprehensive feature set designed as an integrated AI Business Operating System rather than a collection of separate tools.

Core features include: AI Employees (role-based customer-facing agents), Knowledge Base (document and FAQ management with RAG), Unified Inbox (omnichannel conversations), CRM (contacts, pipelines, tags, and segments), Automation Builder (visual workflows), Analytics (channel, campaign, and AI performance dashboards), Marketplace (industry packs and templates), and Sarah (internal AI Operating Assistant).

All features share the same tenant workspace, CRM data, and knowledge—eliminating the integration gaps common when businesses stitch together separate chatbot, CRM, and automation tools.`,
        rel: ["KB-ABOUT-0001", "KB-ABOUT-0010"],
    },
    {
        id: "KB-ABOUT-0062",
        sub: "Platform Features",
        diff: "Intermediate",
        q: "What is the Automation Builder?",
        kw: ["Automation Builder", "workflows", "triggers", "visual"],
        a: `The Automation Builder is ZiricAI's visual workflow designer for creating business automations without code.

Build workflows with triggers (new message, CRM stage change, schedule, webhook), conditions (message content, customer tags, time of day), and actions (send message, update CRM, assign agent, create ticket, call API). Automations run alongside AI employees—handling backend processes while AI handles conversations.

Clone workflows across branches, test in sandbox mode, and monitor execution logs for troubleshooting.`,
        rel: ["KB-ABOUT-0026"],
    },
    {
        id: "KB-ABOUT-0063",
        sub: "Platform Features",
        diff: "Intermediate",
        q: "What file types can I upload to the Knowledge Base?",
        kw: ["upload", "PDF", "DOCX", "TXT", "documents"],
        a: `The Knowledge Base accepts PDF, DOCX, TXT, and structured FAQ entries for ingestion and retrieval-augmented generation.

Uploaded documents are processed into searchable chunks that AI employees reference when composing answers. You can also paste FAQs directly, import from spreadsheets, or start from Marketplace industry pack templates.

Keep documents current—when pricing or policies change, update the Knowledge Base promptly so AI employees reflect accurate information.`,
        rel: ["KB-ABOUT-0014", "KB-ABOUT-0039"],
    },
    {
        id: "KB-ABOUT-0064",
        sub: "Platform Features",
        diff: "Intermediate",
        q: "Does ZiricAI include lead scoring?",
        kw: ["lead scoring", "CRM", "intent", "sentiment"],
        a: `Yes. ZiricAI's AI employees analyze conversation intent and sentiment to prioritize hot leads in CRM.

Signals like purchase intent, urgency language, budget mentions, and repeated enquiries boost lead scores automatically. Sales teams see prioritized lists in CRM rather than chronologically sorted messages.

Lead scoring rules can be customized per AI employee and industry pack—automotive packs weight test drive requests differently than healthcare packs weight appointment urgency.`,
        rel: ["KB-ABOUT-0046", "KB-ABOUT-0026"],
    },
    {
        id: "KB-ABOUT-0065",
        sub: "Platform Features",
        diff: "Intermediate",
        q: "Can I customize branding in ZiricAI?",
        kw: ["branding", "customization", "widget", "avatar"],
        a: `Yes. Customize your company's presence across customer touchpoints.

Set company name, brand colours, chat widget appearance, and AI employee names and avatars. Web chat widget styling matches your website design. WhatsApp Business profile displays your verified business name and logo.

Enterprise plans extend branding to custom domains and white-label portal experiences. All plans include basic brand customization at no extra cost.`,
        rel: ["KB-ABOUT-0040"],
    },
    {
        id: "KB-ABOUT-0066",
        sub: "Platform Features",
        diff: "Intermediate",
        q: "Does ZiricAI support webhooks?",
        kw: ["webhooks", "API", "events", "integrations"],
        a: `Yes. Automations and the REST API support webhooks for real-time event delivery to external systems.

Trigger webhooks on new conversations, CRM updates, automation completions, or custom events. External systems receive JSON payloads with event details for processing in your ERP, data warehouse, or custom applications.

Webhook endpoints are configured in the Automation Builder or via API settings, with retry logic and delivery logs for reliability monitoring.`,
        rel: ["KB-ABOUT-0051", "KB-ABOUT-0062"],
        style: "For developers: mention JSON payloads, retry logic, and API docs. For business users: explain as automatic notifications to other software.",
    },
];

const ALL = [...SECTION_A, ...SECTION_A_EXTENDED, ...SECTION_B];
const body = ALL.map(fmt).join("\n");
fs.writeFileSync(OUT, HEADER + body, "utf8");
console.log(`✓ Generated ${OUT}`);
console.log(`  ${ALL.length} entries (Section A: ${SECTION_A.length + SECTION_A_EXTENDED.length}, Section B: ${SECTION_B.length})`);
