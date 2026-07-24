#!/usr/bin/env node
/**
 * One-time migration: old knowledge/*.md → 25-category metadata-rich format.
 * Run: node scripts/migrate-knowledge-v2.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");

const QA_BLOCK_RE = /^## Q:\s*(.+?)\r?\n\*\*A:\*\*\s*([\s\S]*?)(?=^## Q:|$)/gm;

/** Old file → { newFile, category, idPrefix, subCategory, audience, difficulty, phase } */
const FILE_MAP = {
    "01-about.md": { newFile: "01_About_ZiricAI.md", category: "About ZiricAI", idPrefix: "ABOUT", subCategory: "Introduction", audience: ["Customer", "Sales"], difficulty: "Beginner", phase: 1 },
    "03-features.md": { newFile: "01_About_ZiricAI.md", category: "About ZiricAI", idPrefix: "ABOUT", subCategory: "Platform Features", audience: ["Customer"], difficulty: "Intermediate", phase: 1 },
    "05-pricing.md": { newFile: "02_Pricing.md", category: "Pricing", idPrefix: "PRICING", subCategory: "Plans", audience: ["Customer", "Sales"], difficulty: "Beginner", phase: 1 },
    "faq.md": { newFile: "03_FAQ.md", category: "FAQ", idPrefix: "FAQ", subCategory: "General", audience: ["Customer"], difficulty: "Beginner", phase: 1 },
    "04-industries.md": { newFile: "04_Industries.md", category: "Industries", idPrefix: "IND", subCategory: "Verticals", audience: ["Customer", "Sales"], difficulty: "Intermediate", phase: 3 },
    "02-ai-employees.md": { newFile: "05_AI_Employees.md", category: "AI Employees", idPrefix: "AIEMP", subCategory: "Roles", audience: ["Customer"], difficulty: "Beginner", phase: 1 },
    "06-marketplace.md": { newFile: "06_Marketplace.md", category: "Marketplace", idPrefix: "MKT", subCategory: "Industry Packs", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "07-automation.md": { newFile: "07_Automation.md", category: "Automation", idPrefix: "AUTO", subCategory: "Workflows", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "08-crm.md": { newFile: "08_CRM.md", category: "CRM", idPrefix: "CRM", subCategory: "Contacts", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "09-analytics.md": { newFile: "09_Analytics.md", category: "Analytics", idPrefix: "ANLY", subCategory: "Dashboards", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "10-whatsapp.md": { newFile: "10_WhatsApp.md", category: "WhatsApp", idPrefix: "WA", subCategory: "Setup", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "11-integrations.md": { newFile: "11_Integrations.md", category: "Integrations", idPrefix: "INTG", subCategory: "Channels", audience: ["Customer"], difficulty: "Intermediate", phase: 2 },
    "12-api.md": { newFile: "12_API.md", category: "API", idPrefix: "API", subCategory: "REST", audience: ["Developer"], difficulty: "Advanced", phase: 2 },
    "13-tutorials.md": { newFile: "13_Tutorials.md", category: "Tutorials", idPrefix: "TUT", subCategory: "Getting Started", audience: ["Customer"], difficulty: "Beginner", phase: 4 },
    "29-best-practices.md": { newFile: "13_Tutorials.md", category: "Tutorials", idPrefix: "TUT", subCategory: "Best Practices", audience: ["Customer"], difficulty: "Intermediate", phase: 5 },
    "14-documentation.md": { newFile: "14_Documentation.md", category: "Documentation", idPrefix: "DOC", subCategory: "Reference", audience: ["Developer"], difficulty: "Advanced", phase: 4 },
    "26-glossary.md": { newFile: "14_Documentation.md", category: "Documentation", idPrefix: "DOC", subCategory: "Glossary", audience: ["Customer", "Developer"], difficulty: "Beginner", phase: 4 },
    "23-company.md": { newFile: "15_Company.md", category: "Company", idPrefix: "CO", subCategory: "About Us", audience: ["Customer", "Sales"], difficulty: "Beginner", phase: 1 },
    "30-success-stories.md": { newFile: "15_Company.md", category: "Company", idPrefix: "CO", subCategory: "Success Stories", audience: ["Customer", "Sales"], difficulty: "Beginner", phase: 5 },
    "27-internal-policies.md": { newFile: "15_Company.md", category: "Company", idPrefix: "CO", subCategory: "Internal Policies", audience: ["Internal"], difficulty: "Intermediate", phase: 4 },
    "18-sales.md": { newFile: "16_Sales.md", category: "Sales", idPrefix: "SALES", subCategory: "Playbooks", audience: ["Sales"], difficulty: "Intermediate", phase: 3 },
    "19-objections.md": { newFile: "17_Objection_Handling.md", category: "Objection Handling", idPrefix: "OBJ", subCategory: "Responses", audience: ["Sales"], difficulty: "Intermediate", phase: 3 },
    "20-comparisons.md": { newFile: "18_Competitive_Comparison.md", category: "Competitive Comparison", idPrefix: "COMP", subCategory: "Alternatives", audience: ["Sales"], difficulty: "Intermediate", phase: 3 },
    "15-security.md": { newFile: "19_Security.md", category: "Security", idPrefix: "SEC", subCategory: "Infrastructure", audience: ["Customer", "Developer"], difficulty: "Advanced", phase: 4 },
    "16-popia.md": { newFile: "20_POPIA.md", category: "POPIA", idPrefix: "POPIA", subCategory: "Compliance", audience: ["Customer"], difficulty: "Intermediate", phase: 4 },
    "17-gdpr.md": { newFile: "21_GDPR.md", category: "GDPR", idPrefix: "GDPR", subCategory: "Compliance", audience: ["Customer"], difficulty: "Intermediate", phase: 4 },
    "22-support.md": { newFile: "22_Support.md", category: "Support", idPrefix: "SUP", subCategory: "Help", audience: ["Customer"], difficulty: "Beginner", phase: 4 },
    "28-troubleshooting.md": { newFile: "22_Support.md", category: "Support", idPrefix: "SUP", subCategory: "Troubleshooting", audience: ["Customer"], difficulty: "Intermediate", phase: 4 },
    "21-billing.md": { newFile: "23_Billing.md", category: "Billing", idPrefix: "BILL", subCategory: "Payments", audience: ["Customer"], difficulty: "Beginner", phase: 4 },
    "24-blogs.md": { newFile: "24_Blogs.md", category: "Blogs", idPrefix: "BLOG", subCategory: "Articles", audience: ["Customer"], difficulty: "Beginner", phase: 5 },
    "25-product-updates.md": { newFile: "25_Updates.md", category: "Updates", idPrefix: "UPD", subCategory: "Release Notes", audience: ["Customer"], difficulty: "Beginner", phase: 5 },
};

const OLD_FILES = Object.keys(FILE_MAP);
const FLAT_ALIASES = [
    "about.md", "employees.md", "features.md", "industries.md", "pricing.md",
    "marketplace.md", "automation.md", "crm.md", "analytics.md", "whatsapp.md",
    "facebook.md", "instagram.md", "api.md", "billing.md", "company.md",
    "support.md", "tutorials.md", "blogs.md", "security.md", "comparisons.md", "objections.md",
];

/** Phase 1 expansion — new Q&A toward ~2k core target */
const PHASE1_EXPANSION = {
    "01_About_ZiricAI.md": [
        { q: "What does AI Business Operating System mean in practice?", a: "It means one platform runs your customer channels, AI employees, knowledge, CRM, automations, and analytics — not separate chatbot, CRM, and helpdesk tools.", sub: "Concepts", kw: ["AI Business Operating System", "platform", "unified"] },
        { q: "How is ZiricAI different from ChatGPT?", a: "ChatGPT answers from general internet knowledge. ZiricAI answers only from your uploaded documents with CRM context, automations, and WhatsApp routing built in.", sub: "Concepts", kw: ["ChatGPT", "comparison", "grounded"] },
        { q: "Can ZiricAI work for solo entrepreneurs?", a: "Yes — Starter plan with one AI employee is designed for owner-operators who cannot answer every WhatsApp after hours.", sub: "Audience", kw: ["solo", "SME", "Starter"] },
        { q: "What is tenant isolation?", a: "Each company workspace has separate data, users, knowledge, and billing. No customer or conversation data crosses between tenants.", sub: "Architecture", kw: ["tenant", "isolation", "security"] },
        { q: "Does ZiricAI support agencies?", a: "Agencies manage multiple isolated Company Portals — one per client — from separate tenant accounts or team access.", sub: "Audience", kw: ["agency", "multi-tenant", "clients"] },
        { q: "What is the unified inbox?", a: "All WhatsApp, web chat, Facebook, Instagram, email, and SMS threads appear in one view with shared CRM profiles.", sub: "Platform Features", kw: ["unified inbox", "omnichannel"] },
        { q: "What is RAG in ZiricAI?", a: "Retrieval-augmented generation searches your Knowledge Base first, then composes answers from matching document chunks.", sub: "Platform Features", kw: ["RAG", "knowledge", "accuracy"] },
        { q: "Can I white-label ZiricAI?", a: "Enterprise plans support custom branding, domains, and partner arrangements — contact sales@ziricai.com.", sub: "Enterprise", kw: ["white-label", "Enterprise", "branding"] },
        { q: "What browsers work with the Company Portal?", a: "Latest Chrome, Edge, Firefox, and Safari on desktop and mobile.", sub: "Platform Features", kw: ["browser", "portal", "compatibility"] },
        { q: "Is ZiricAI suitable for load shedding?", a: "Cloud-hosted AI stays online when customers have connectivity. Your team needs internet to use the portal.", sub: "Operations", kw: ["load shedding", "uptime", "South Africa"] },
    ],
    "02_Pricing.md": [
        { q: "What is included in the free trial?", a: "Full platform access for 14 days — AI employees, WhatsApp, CRM, automations, analytics, and Sarah. No credit card required.", sub: "Trial", kw: ["trial", "free", "14 days"] },
        { q: "Can I switch plans mid-month?", a: "Upgrades apply immediately with prorated billing. Downgrades take effect at the next billing cycle.", sub: "Plans", kw: ["upgrade", "downgrade", "prorate"] },
        { q: "Are there setup fees?", a: "No setup fees on Trial through Business. Enterprise may include optional onboarding packages.", sub: "Plans", kw: ["setup fee", "onboarding"] },
        { q: "What currency is billing in?", a: "South African Rand (ZAR) for all standard plans.", sub: "Billing", kw: ["ZAR", "currency", "South Africa"] },
        { q: "Do you offer annual discounts?", a: "Contact sales@ziricai.com for annual billing options on Professional and Business plans.", sub: "Discounts", kw: ["annual", "discount", "sales"] },
        { q: "What happens when I hit message limits?", a: "You receive usage warnings at 80% and 100%. Upgrade your plan or wait for the next billing cycle reset.", sub: "Limits", kw: ["limits", "messages", "upgrade"] },
        { q: "Is VAT included in listed prices?", a: "Listed prices exclude VAT where applicable. VAT is added at checkout for South African businesses.", sub: "Billing", kw: ["VAT", "tax", "ZAR"] },
        { q: "Can NGOs get discounted pricing?", a: "Registered NGOs and NPOs may qualify for reduced rates — email sales@ziricai.com with registration details.", sub: "Discounts", kw: ["NGO", "NPO", "discount"] },
    ],
    "03_FAQ.md": [
        { q: "How do I reset my password?", a: "Use Forgot Password on the login page. A reset link is sent to your registered email within minutes.", sub: "Account", kw: ["password", "reset", "login"] },
        { q: "Can I use ZiricAI without WhatsApp?", a: "Yes — web chat, Facebook, Instagram, email, and SMS channels work independently of WhatsApp.", sub: "Channels", kw: ["WhatsApp", "channels", "web chat"] },
        { q: "How do I contact human support?", a: "Email support@ziricai.com, use live chat in the portal, or ask Sarah to open a support ticket.", sub: "Support", kw: ["support", "contact", "help"] },
        { q: "Does ZiricAI work outside South Africa?", a: "Yes — the platform supports international businesses. POPIA and ZAR pricing are optimized for SA but not required.", sub: "Geography", kw: ["international", "South Africa", "global"] },
        { q: "What happens to my data if I cancel?", a: "You can export CRM and knowledge data before closure. Data is deleted per retention policy after account closure.", sub: "Account", kw: ["cancel", "data export", "retention"] },
        { q: "Can I import existing FAQs?", a: "Upload PDF, DOCX, or TXT files, or paste FAQs directly into the Knowledge Base editor.", sub: "Knowledge", kw: ["import", "FAQ", "upload"] },
        { q: "Is there a mobile app?", a: "Use the responsive Company Portal in your mobile browser. Customers reach AI employees on WhatsApp and social apps.", sub: "Access", kw: ["mobile", "app", "portal"] },
        { q: "How quickly does Sarah respond?", a: "Sarah replies in seconds inside the Company Portal using the same knowledge base as customer-facing AI employees.", sub: "Sarah", kw: ["Sarah", "response time", "portal"] },
    ],
    "05_AI_Employees.md": [
        { q: "What is the difference between Sarah and an AI Employee?", a: "Sarah helps your team operate the platform internally. AI Employees serve your customers on WhatsApp, web, and social channels.", sub: "Roles", kw: ["Sarah", "AI Employee", "internal vs external"] },
        { q: "Can I create a custom AI role?", a: "Yes — define name, tone, knowledge scope, and channels beyond Reception, Sales, and Support presets.", sub: "Configuration", kw: ["custom role", "configuration"] },
        { q: "How do I test an AI Employee before launch?", a: "Use the sandbox preview in the portal to ask test questions against linked Knowledge Base content.", sub: "Testing", kw: ["sandbox", "preview", "testing"] },
        { q: "Can AI Employees handle voice calls?", a: "Voice is on the roadmap. Current focus is text channels: WhatsApp, web chat, social DMs, email, and SMS.", sub: "Channels", kw: ["voice", "roadmap", "channels"] },
        { q: "What happens when an AI Employee hits its message limit?", a: "Messages pause until the next billing cycle or plan upgrade. You receive warnings before the limit is reached.", sub: "Limits", kw: ["limits", "messages", "billing"] },
        { q: "Can I assign different business hours per AI Employee?", a: "Yes — configure per-role schedules. Reception 08:00–17:00 and Support 24/7 on the same tenant.", sub: "Configuration", kw: ["business hours", "schedule"] },
        { q: "Do AI Employees share CRM data?", a: "All AI Employees write to the same tenant CRM with unified customer timelines and tags.", sub: "CRM", kw: ["CRM", "shared data", "timeline"] },
        { q: "How do I improve inaccurate AI answers?", a: "Add missing FAQs to the Knowledge Base, refine wording, and mark incorrect replies for admin review.", sub: "Quality", kw: ["accuracy", "knowledge", "improvement"] },
    ],
    "15_Company.md": [
        { q: "Where is ZiricAI headquartered?", a: "ZiricAI is a South African technology company built for local SMEs with ZAR pricing and POPIA-first compliance.", sub: "About Us", kw: ["headquarters", "South Africa", "company"] },
        { q: "How can I partner with ZiricAI?", a: "Agencies and consultants can join the partner programme — email partners@ziricai.com for reseller and referral terms.", sub: "Partnerships", kw: ["partner", "agency", "reseller"] },
        { q: "Does ZiricAI have investors?", a: "ZiricAI is founder-led and customer-funded, focused on sustainable growth for South African SMEs.", sub: "About Us", kw: ["investors", "funding", "company"] },
        { q: "How do I request a media interview?", a: "Email press@ziricai.com with your publication, audience, and topic. Response within 2 business days.", sub: "Media", kw: ["press", "media", "interview"] },
        { q: "Is ZiricAI hiring?", a: "Open roles are posted at ziricai.com/careers and on LinkedIn. We hire remote-first across South Africa.", sub: "Careers", kw: ["careers", "hiring", "jobs"] },
        { q: "What is ZiricAI's support SLA?", a: "Starter and Professional: next business day. Business: same business day. Enterprise: custom SLA with dedicated contact.", sub: "Support", kw: ["SLA", "support", "response time"] },
    ],
};

function parseQA(content) {
    const pairs = [];
    QA_BLOCK_RE.lastIndex = 0;
    let match;
    while ((match = QA_BLOCK_RE.exec(content)) !== null) {
        pairs.push({ question: match[1].trim(), answer: match[2].trim().replace(/\s+$/g, "") });
    }
    return pairs;
}

function inferKeywords(question, answer, extra = []) {
    const text = `${question} ${answer}`.toLowerCase();
    const base = [...extra];
    const terms = ["ZiricAI", "WhatsApp", "CRM", "Sarah", "AI Employee", "Knowledge Base", "POPIA", "automation"];
    for (const t of terms) {
        if (text.includes(t.toLowerCase())) base.push(t);
    }
    return [...new Set(base)].slice(0, 8);
}

function formatEntry(meta, question, answer) {
    const lines = [
        "---",
        `id: ${meta.id}`,
        `category: ${meta.category}`,
        `sub_category: ${meta.subCategory}`,
        `difficulty: ${meta.difficulty}`,
        "keywords:",
        ...meta.keywords.map((k) => `  - ${k}`),
        "audience:",
        ...meta.audience.map((a) => `  - ${a}`),
        `last_updated: 2026-07-24`,
        "related: []",
        "---",
        "",
        `## Q: ${question}`,
        `**A:** ${answer}`,
        "",
    ];
    return lines.join("\n");
}

function main() {
    const outputFiles = new Map();

    for (const oldFile of OLD_FILES) {
        const map = FILE_MAP[oldFile];
        const filePath = path.join(KNOWLEDGE_DIR, oldFile);
        if (!fs.existsSync(filePath)) {
            console.warn(`  skip missing: ${oldFile}`);
            continue;
        }
        const content = fs.readFileSync(filePath, "utf8");
        const pairs = parseQA(content);
        if (!outputFiles.has(map.newFile)) {
            outputFiles.set(map.newFile, { entries: [], config: map });
        }
        const bucket = outputFiles.get(map.newFile);
        for (const pair of pairs) {
            bucket.entries.push({
                ...pair,
                map,
            });
        }
        console.log(`  read ${oldFile} → ${pairs.length} Q&A`);
    }

    // Apply phase 1 expansion
    for (const [newFile, expansions] of Object.entries(PHASE1_EXPANSION)) {
        if (!outputFiles.has(newFile)) {
            const map = Object.values(FILE_MAP).find((m) => m.newFile === newFile);
            outputFiles.set(newFile, { entries: [], config: map });
        }
        const bucket = outputFiles.get(newFile);
        for (const exp of expansions) {
            bucket.entries.push({
                question: exp.q,
                answer: exp.a,
                map: {
                    ...bucket.config,
                    subCategory: exp.sub || bucket.config.subCategory,
                    keywords: exp.kw,
                },
            });
        }
    }

    // Assign IDs and write files
    const idCounters = {};
    let totalWritten = 0;

    for (const [newFile, bucket] of [...outputFiles.entries()].sort()) {
        const config = bucket.config;
        const prefix = config.idPrefix;
        if (!idCounters[prefix]) idCounters[prefix] = 0;

        const seen = new Set();
        const blocks = [];
        const fileHeader = `# ${config.category}\n> ZiricAI Platform Knowledge Base | Phase ${config.phase}\n\n`;

        for (const entry of bucket.entries) {
            const key = entry.question.toLowerCase().trim();
            if (seen.has(key)) continue;
            seen.add(key);

            idCounters[prefix]++;
            const id = `KB-${prefix}-${String(idCounters[prefix]).padStart(4, "0")}`;
            const meta = {
                id,
                category: entry.map.category,
                subCategory: entry.map.subCategory,
                difficulty: entry.map.difficulty,
                audience: entry.map.audience,
                keywords: inferKeywords(entry.question, entry.answer, entry.map.keywords || []),
            };
            blocks.push(formatEntry(meta, entry.question, entry.answer));
            totalWritten++;
        }

        fs.writeFileSync(path.join(KNOWLEDGE_DIR, newFile), fileHeader + blocks.join("\n"), "utf8");
        console.log(`✓ wrote ${newFile} — ${seen.size} Q&A`);
    }

    // Remove old files
    const toRemove = [
        ...OLD_FILES,
        ...FLAT_ALIASES,
        ...fs.readdirSync(KNOWLEDGE_DIR).filter((f) => /^\d{2}-/.test(f) && f.endsWith(".md")),
    ];
    for (const f of [...new Set(toRemove)]) {
        const p = path.join(KNOWLEDGE_DIR, f);
        if (fs.existsSync(p) && !f.startsWith("0") && !f.match(/^\d{2}_/)) {
            // only remove old-format files
        }
        if (fs.existsSync(p) && (/^\d{2}-/.test(f) || FLAT_ALIASES.includes(f))) {
            fs.unlinkSync(p);
            console.log(`  removed ${f}`);
        }
    }

    console.log(`\nMigration complete: ${totalWritten} Q&A across ${outputFiles.size} files`);
}

main();
