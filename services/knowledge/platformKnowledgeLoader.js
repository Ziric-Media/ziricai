/**
 * ZiricAI Platform Knowledge Loader
 * Reads all markdown Q&A from knowledge/ — source of truth for Sarah + landing FAQ.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPricingSummaryText, getDefaultPlatformReply, formatPrice, getPlan, getPublicPlans } from "../platform/billingPlans.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");

/** 30-category taxonomy manifest */
export const CATEGORY_MANIFEST = [
    { order: 1, id: "about", title: "About", file: "01-about.md" },
    { order: 2, id: "ai-employees", title: "AI Employees", file: "02-ai-employees.md" },
    { order: 3, id: "features", title: "Features", file: "03-features.md" },
    { order: 4, id: "industries", title: "Industries", file: "04-industries.md" },
    { order: 5, id: "pricing", title: "Pricing", file: "05-pricing.md" },
    { order: 6, id: "marketplace", title: "Marketplace", file: "06-marketplace.md" },
    { order: 7, id: "automation", title: "Automation", file: "07-automation.md" },
    { order: 8, id: "crm", title: "CRM", file: "08-crm.md" },
    { order: 9, id: "analytics", title: "Analytics", file: "09-analytics.md" },
    { order: 10, id: "whatsapp", title: "WhatsApp", file: "10-whatsapp.md" },
    { order: 11, id: "integrations", title: "Integrations", file: "11-integrations.md" },
    { order: 12, id: "api", title: "API", file: "12-api.md" },
    { order: 13, id: "tutorials", title: "Tutorials", file: "13-tutorials.md" },
    { order: 14, id: "documentation", title: "Documentation", file: "14-documentation.md" },
    { order: 15, id: "security", title: "Security", file: "15-security.md" },
    { order: 16, id: "popia", title: "POPIA", file: "16-popia.md" },
    { order: 17, id: "gdpr", title: "GDPR", file: "17-gdpr.md" },
    { order: 18, id: "sales", title: "Sales", file: "18-sales.md" },
    { order: 19, id: "objections", title: "Objection Handling", file: "19-objections.md" },
    { order: 20, id: "comparisons", title: "Competitive Comparison", file: "20-comparisons.md" },
    { order: 21, id: "billing", title: "Billing", file: "21-billing.md" },
    { order: 22, id: "support", title: "Support", file: "22-support.md" },
    { order: 23, id: "company", title: "Company", file: "23-company.md" },
    { order: 24, id: "blogs", title: "Blogs", file: "24-blogs.md" },
    { order: 25, id: "product-updates", title: "Product Updates", file: "25-product-updates.md" },
    { order: 26, id: "glossary", title: "Glossary", file: "26-glossary.md" },
    { order: 27, id: "internal-policies", title: "Internal Policies", file: "27-internal-policies.md" },
    { order: 28, id: "troubleshooting", title: "Technical Troubleshooting", file: "28-troubleshooting.md" },
    { order: 29, id: "best-practices", title: "Best Practices", file: "29-best-practices.md" },
    { order: 30, id: "success-stories", title: "Success Stories", file: "30-success-stories.md" },
];

/** Flat alias filenames → canonical category id */
export const FLAT_ALIASES = {
    "about.md": "about",
    "employees.md": "ai-employees",
    "features.md": "features",
    "industries.md": "industries",
    "pricing.md": "pricing",
    "marketplace.md": "marketplace",
    "automation.md": "automation",
    "crm.md": "crm",
    "analytics.md": "analytics",
    "whatsapp.md": "whatsapp",
    "facebook.md": "integrations",
    "instagram.md": "integrations",
    "api.md": "api",
    "billing.md": "billing",
    "company.md": "company",
    "support.md": "support",
    "tutorials.md": "tutorials",
    "blogs.md": "blogs",
    "security.md": "security",
    "comparisons.md": "comparisons",
    "objections.md": "objections",
    "faq.md": "faq",
};

const QA_BLOCK_RE = /^## Q:\s*(.+?)\r?\n\*\*A:\*\*\s*([\s\S]*?)(?=^## Q:|$)/gm;

let _cache = null;
let _cacheMtime = 0;

function getKnowledgeMtime() {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return 0;
    let latest = 0;
    for (const name of fs.readdirSync(KNOWLEDGE_DIR)) {
        if (!name.endsWith(".md")) continue;
        const stat = fs.statSync(path.join(KNOWLEDGE_DIR, name));
        latest = Math.max(latest, stat.mtimeMs);
    }
    return latest;
}

function resolveCategory(filename) {
    const base = path.basename(filename);
    if (FLAT_ALIASES[base]) return FLAT_ALIASES[base];
    const manifest = CATEGORY_MANIFEST.find((c) => c.file === base);
    if (manifest) return manifest.id;
    const numMatch = base.match(/^\d+-(.+)\.md$/);
    if (numMatch) return numMatch[1];
    return base.replace(/\.md$/, "");
}

function resolveCategoryTitle(categoryId) {
    const manifest = CATEGORY_MANIFEST.find((c) => c.id === categoryId);
    if (manifest) return manifest.title;
    if (categoryId === "faq") return "FAQ";
    return categoryId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse Q&A pairs from markdown content */
export function parseMarkdownQA(content, meta = {}) {
    const pairs = [];
    if (!content) return pairs;

    QA_BLOCK_RE.lastIndex = 0;
    let match;
    while ((match = QA_BLOCK_RE.exec(content)) !== null) {
        const question = match[1].trim();
        const answer = match[2].trim().replace(/\s+$/g, "");
        if (!question || !answer) continue;
        pairs.push({
            question,
            answer,
            category: meta.category || "general",
            categoryTitle: meta.categoryTitle || resolveCategoryTitle(meta.category || "general"),
            sourceFile: meta.sourceFile || null,
            keywords: extractKeywords(question, answer),
        });
    }
    return pairs;
}

function extractKeywords(question, answer) {
    const text = `${question} ${answer}`.toLowerCase();
    const words = text.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    return [...new Set(words)];
}

function injectDynamicAnswers(pairs, categoryId) {
    if (categoryId === "pricing" || categoryId === "billing") {
        return pairs.map((p) => {
            if (/pricing|plan|cost|price|starter|professional|business|enterprise|trial/i.test(p.question)) {
                return { ...p, answer: p.answer.replace(/\{\{PRICING_SUMMARY\}\}/g, getPricingSummaryText()) };
            }
            return p;
        });
    }
    return pairs;
}

/** Read and parse a single markdown file */
export function loadKnowledgeFile(filename) {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const category = resolveCategory(filename);
    const pairs = parseMarkdownQA(content, {
        category,
        categoryTitle: resolveCategoryTitle(category),
        sourceFile: filename,
    });
    return injectDynamicAnswers(pairs, category);
}

/** Load all .md files from knowledge/, dedupe by question text */
export function loadAllKnowledgeFiles(options = {}) {
    const { force = false } = options;
    const mtime = getKnowledgeMtime();
    if (!force && _cache && mtime === _cacheMtime) return _cache;

    if (!fs.existsSync(KNOWLEDGE_DIR)) {
        _cache = { files: [], pairs: [], byCategory: {} };
        _cacheMtime = mtime;
        return _cache;
    }

    const seenQuestions = new Set();
    const files = [];
    const pairs = [];
    const byCategory = {};

    const aliasFiles = new Set(Object.keys(FLAT_ALIASES));
    const canonicalFiles = new Set(CATEGORY_MANIFEST.map((c) => c.file));

    const mdFiles = fs
        .readdirSync(KNOWLEDGE_DIR)
        .filter((f) => {
            if (!f.endsWith(".md") || f === "README.md") return false;
            // Skip flat aliases when canonical numbered file exists (avoid double-count)
            if (aliasFiles.has(f) && f !== "faq.md") {
                const manifest = CATEGORY_MANIFEST.find((c) => c.id === FLAT_ALIASES[f]);
                if (manifest && fs.existsSync(path.join(KNOWLEDGE_DIR, manifest.file))) return false;
            }
            return true;
        })
        .sort((a, b) => {
            const orderA = CATEGORY_MANIFEST.find((c) => c.file === a)?.order ?? 999;
            const orderB = CATEGORY_MANIFEST.find((c) => c.file === b)?.order ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });

    for (const filename of mdFiles) {
        const filePairs = loadKnowledgeFile(filename);
        const category = resolveCategory(filename);
        const deduped = [];

        for (const pair of filePairs) {
            const key = pair.question.toLowerCase().trim();
            if (seenQuestions.has(key)) continue;
            seenQuestions.add(key);
            deduped.push(pair);
            pairs.push(pair);
            if (!byCategory[category]) byCategory[category] = [];
            byCategory[category].push(pair);
        }

        files.push({ filename, category, count: deduped.length });
    }

    _cache = { files, pairs, byCategory };
    _cacheMtime = mtime;
    return _cache;
}

/** Normalize text for search matching */
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

/** Score a Q&A pair against a normalized query */
export function scoreKnowledgeMatch(normalizedQuery, pair) {
    if (!normalizedQuery) return 0;
    const qNorm = normalizeQuestionText(pair.question);
    const aNorm = normalizeQuestionText(pair.answer);
    let score = 0;

    if (qNorm === normalizedQuery) return 200;
    if (qNorm.includes(normalizedQuery) || normalizedQuery.includes(qNorm)) score += 80;

    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);
    for (const word of queryWords) {
        const re = new RegExp(`\\b${escapeRegExp(word)}\\b`);
        if (re.test(qNorm)) score += 18;
        if (re.test(aNorm)) score += 6;
        for (const kw of pair.keywords || []) {
            if (kw === word || kw.includes(word)) score += 4;
        }
    }

    if (pair.category && normalizedQuery.includes(pair.category.replace(/-/g, " "))) {
        score += 12;
    }

    return score;
}

/**
 * Keyword search across all knowledge Q&A pairs.
 * @param {string} query
 * @param {{ limit?: number, category?: string, minScore?: number }} [options]
 */
export function searchKnowledge(query, options = {}) {
    const { limit = 8, category = null, minScore = 12 } = options;
    const normalized = normalizeQuestionText(query);
    if (!normalized) return [];

    const { pairs } = loadAllKnowledgeFiles();
    const pool = category ? pairs.filter((p) => p.category === category) : pairs;

    return pool
        .map((pair) => ({ ...pair, score: scoreKnowledgeMatch(normalized, pair) }))
        .filter((p) => p.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/** Knowledge base statistics */
export function getKnowledgeStats() {
    const data = loadAllKnowledgeFiles();
    const categoryStats = CATEGORY_MANIFEST.map((cat) => ({
        id: cat.id,
        title: cat.title,
        file: cat.file,
        count: (data.byCategory[cat.id] || []).length,
    }));

    const extraCategories = Object.keys(data.byCategory)
        .filter((id) => !CATEGORY_MANIFEST.find((c) => c.id === id))
        .map((id) => ({
            id,
            title: resolveCategoryTitle(id),
            file: null,
            count: data.byCategory[id].length,
        }));

    return {
        fileCount: data.files.length,
        questionCount: data.pairs.length,
        categoryCount: categoryStats.filter((c) => c.count > 0).length + extraCategories.filter((c) => c.count > 0).length,
        categories: [...categoryStats, ...extraCategories],
        files: data.files,
        target: 15000,
        progressPct: Math.round((data.pairs.length / 15000) * 10000) / 100,
    };
}

/**
 * Build compact summary for Sarah system prompt.
 * Includes category manifest + smart retrieval when query provided.
 * @param {{ query?: string, maxChars?: number, matchLimit?: number }} [options]
 */
export function getPlatformKnowledgeSummary(options = {}) {
    const { query = "", maxChars = 4500, matchLimit = 6 } = options;
    const stats = getKnowledgeStats();
    const data = loadAllKnowledgeFiles();

    const lines = [
        `ZiricAI Knowledge Base (${stats.questionCount} Q&A across ${stats.categoryCount} categories; target ${stats.target.toLocaleString()}+)`,
        "",
        "Categories:",
        ...CATEGORY_MANIFEST.map((c) => {
            const count = (data.byCategory[c.id] || []).length;
            return `  ${c.order}. ${c.title} (${count} Q&A)`;
        }),
        "",
    ];

    if (query) {
        const matches = searchKnowledge(query, { limit: matchLimit, minScore: 10 });
        if (matches.length) {
            lines.push(`Relevant to current question (${matches.length} matches):`);
            for (const m of matches) {
                lines.push(`• [${m.categoryTitle}] Q: ${m.question}`);
                lines.push(`  A: ${m.answer.slice(0, 220)}${m.answer.length > 220 ? "…" : ""}`);
            }
            lines.push("");
        }
    }

    lines.push("Category highlights (first Q per category):");
    for (const cat of CATEGORY_MANIFEST) {
        const first = (data.byCategory[cat.id] || [])[0];
        if (first) {
            lines.push(`• ${cat.title}: ${first.question} → ${first.answer.slice(0, 100)}…`);
        }
    }

    lines.push("");
    lines.push(`Pricing (canonical): ${getPricingSummaryText()}`);

    let summary = lines.join("\n");
    if (summary.length > maxChars) {
        summary = summary.slice(0, maxChars - 20) + "\n…[truncated]";
    }
    return summary;
}

/** Match platform question — backward-compatible with legacy platformKnowledge.js */
export function matchPlatformQuestion(text, context = {}) {
    const normalized = normalizeQuestionText(text);
    if (!normalized) return null;

    const matches = searchKnowledge(text, { limit: 1, minScore: 15 });
    if (matches.length) {
        const best = matches[0];
        return {
            id: best.category,
            answer: best.answer,
            title: best.categoryTitle,
            question: best.question,
            score: best.score,
        };
    }

    if (context.lastTopicId) {
        const categoryPairs = loadAllKnowledgeFiles().byCategory[context.lastTopicId] || [];
        if (categoryPairs.length) {
            return {
                id: context.lastTopicId,
                answer: categoryPairs[0].answer,
                title: resolveCategoryTitle(context.lastTopicId),
            };
        }
    }

    return null;
}

/** Get answer for topic or free-text question */
export function getPlatformAnswer(topicOrQuestion = "general", context = {}) {
    const topic = String(topicOrQuestion || "").toLowerCase();

    const categoryMap = {
        aiemployee: "ai-employees",
        aiemployees: "ai-employees",
        employees: "ai-employees",
        overview: "about",
        general: "about",
        trial: "pricing",
        restaurant: "industries",
        knowledge: "features",
        sarah: "about",
        roi: "sales",
        integrations: "integrations",
        whatsapp: "whatsapp",
    };

    const categoryId = categoryMap[topic] || topic;
    const data = loadAllKnowledgeFiles();
    const categoryPairs = data.byCategory[categoryId];

    if (categoryPairs?.length) {
        return {
            id: categoryId,
            answer: categoryPairs[0].answer,
            title: resolveCategoryTitle(categoryId),
            question: categoryPairs[0].question,
        };
    }

    const matched = matchPlatformQuestion(topicOrQuestion, context);
    if (matched) return matched;

    return {
        id: "general",
        answer: getDefaultPlatformReply(),
        title: "ZiricAI",
    };
}

/** Invalidate in-memory cache (for tests / hot reload) */
export function clearKnowledgeCache() {
    _cache = null;
    _cacheMtime = 0;
}

export { getPricingSummaryText, getDefaultPlatformReply, formatPrice, getPlan, getPublicPlans };
