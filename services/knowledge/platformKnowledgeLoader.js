/**
 * ZiricAI Platform Knowledge Loader
 * Reads metadata-rich markdown Q&A from knowledge/ — source of truth for Sarah + landing FAQ.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPricingSummaryText, getDefaultPlatformReply, formatPrice, getPlan, getPublicPlans } from "../platform/billingPlans.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");

/** v1.0 Knowledge Base target (10 module roadmap) */
export const V1_TARGET = 10000;

/** v1.0 module targets (10 core modules toward 10k entries) */
export const V1_MODULE_MANIFEST = [
    { module: 1, id: "about-ziricai", title: "About ZiricAI", file: "01_About_ZiricAI.md", target: 300 },
    { module: 2, id: "pricing", title: "Pricing", file: "02_Pricing.md", target: 300 },
    { module: 3, id: "faq", title: "FAQ", file: "03_FAQ.md", target: 800 },
    { module: 4, id: "industries", title: "Industries", file: "04_Industries.md", target: 2000 },
    { module: 5, id: "ai-employees", title: "AI Employees", file: "05_AI_Employees.md", target: 500 },
    { module: 6, id: "marketplace", title: "Marketplace", file: "06_Marketplace.md", target: 400 },
    { module: 7, id: "automation", title: "Automation", file: "07_Automation.md", target: 600 },
    { module: 8, id: "crm", title: "CRM", file: "08_CRM.md", target: 600 },
    { module: 9, id: "whatsapp", title: "WhatsApp", file: "10_WhatsApp.md", target: 500 },
    { module: 10, id: "integrations", title: "Integrations", file: "11_Integrations.md", target: 400 },
];

/** 25-category taxonomy with phase targets */
export const CATEGORY_MANIFEST = [
    { order: 1, id: "about-ziricai", title: "About ZiricAI", file: "01_About_ZiricAI.md", idPrefix: "ABOUT", phase: 1, phaseTarget: 300 },
    { order: 2, id: "pricing", title: "Pricing", file: "02_Pricing.md", idPrefix: "PRICING", phase: 1, phaseTarget: 350 },
    { order: 3, id: "faq", title: "FAQ", file: "03_FAQ.md", idPrefix: "FAQ", phase: 1, phaseTarget: 300 },
    { order: 4, id: "industries", title: "Industries", file: "04_Industries.md", idPrefix: "IND", phase: 3, phaseTarget: 600 },
    { order: 5, id: "ai-employees", title: "AI Employees", file: "05_AI_Employees.md", idPrefix: "AIEMP", phase: 1, phaseTarget: 400 },
    { order: 6, id: "marketplace", title: "Marketplace", file: "06_Marketplace.md", idPrefix: "MKT", phase: 2, phaseTarget: 300 },
    { order: 7, id: "automation", title: "Automation", file: "07_Automation.md", idPrefix: "AUTO", phase: 2, phaseTarget: 400 },
    { order: 8, id: "crm", title: "CRM", file: "08_CRM.md", idPrefix: "CRM", phase: 2, phaseTarget: 400 },
    { order: 9, id: "analytics", title: "Analytics", file: "09_Analytics.md", idPrefix: "ANLY", phase: 2, phaseTarget: 250 },
    { order: 10, id: "whatsapp", title: "WhatsApp", file: "10_WhatsApp.md", idPrefix: "WA", phase: 2, phaseTarget: 350 },
    { order: 11, id: "integrations", title: "Integrations", file: "11_Integrations.md", idPrefix: "INTG", phase: 2, phaseTarget: 300 },
    { order: 12, id: "api", title: "API", file: "12_API.md", idPrefix: "API", phase: 2, phaseTarget: 250 },
    { order: 13, id: "tutorials", title: "Tutorials", file: "13_Tutorials.md", idPrefix: "TUT", phase: 4, phaseTarget: 400 },
    { order: 14, id: "documentation", title: "Documentation", file: "14_Documentation.md", idPrefix: "DOC", phase: 4, phaseTarget: 350 },
    { order: 15, id: "company", title: "Company", file: "15_Company.md", idPrefix: "CO", phase: 1, phaseTarget: 250 },
    { order: 16, id: "sales", title: "Sales", file: "16_Sales.md", idPrefix: "SALES", phase: 3, phaseTarget: 400 },
    { order: 17, id: "objection-handling", title: "Objection Handling", file: "17_Objection_Handling.md", idPrefix: "OBJ", phase: 3, phaseTarget: 500 },
    { order: 18, id: "competitive-comparison", title: "Competitive Comparison", file: "18_Competitive_Comparison.md", idPrefix: "COMP", phase: 3, phaseTarget: 400 },
    { order: 19, id: "security", title: "Security", file: "19_Security.md", idPrefix: "SEC", phase: 4, phaseTarget: 300 },
    { order: 20, id: "popia", title: "POPIA", file: "20_POPIA.md", idPrefix: "POPIA", phase: 4, phaseTarget: 250 },
    { order: 21, id: "gdpr", title: "GDPR", file: "21_GDPR.md", idPrefix: "GDPR", phase: 4, phaseTarget: 250 },
    { order: 22, id: "support", title: "Support", file: "22_Support.md", idPrefix: "SUP", phase: 4, phaseTarget: 350 },
    { order: 23, id: "billing", title: "Billing", file: "23_Billing.md", idPrefix: "BILL", phase: 4, phaseTarget: 250 },
    { order: 24, id: "blogs", title: "Blogs", file: "24_Blogs.md", idPrefix: "BLOG", phase: 5, phaseTarget: 200 },
    { order: 25, id: "updates", title: "Updates", file: "25_Updates.md", idPrefix: "UPD", phase: 5, phaseTarget: 200 },
];

export const PHASE_MANIFEST = [
    { phase: 1, name: "Core", target: 2000, categories: ["about-ziricai", "pricing", "faq", "ai-employees", "company"], description: "About, FAQ, Pricing, AI Employees, Features, Company" },
    { phase: 2, name: "Business Platform", target: 3000, categories: ["crm", "automation", "marketplace", "analytics", "whatsapp", "integrations", "api"], description: "CRM, Automation, Marketplace, Analytics, WhatsApp, Integrations, API" },
    { phase: 3, name: "Sales & Growth", target: 2500, categories: ["sales", "objection-handling", "competitive-comparison", "industries"], description: "Sales, Objections, Comparisons, Industries" },
    { phase: 4, name: "Technical & Compliance", target: 3000, categories: ["documentation", "tutorials", "support", "security", "popia", "gdpr", "billing"], description: "Documentation, Tutorials, Support, Security, POPIA, GDPR, Billing" },
    { phase: 5, name: "Content", target: 5000, categories: ["blogs", "updates"], description: "Blogs, Updates, Best Practices, Success Stories" },
];

export const LONG_TERM_TARGET = 50000;

/** Legacy alias map for backward compatibility */
export const CATEGORY_ALIASES = {
    about: "about-ziricai",
    features: "about-ziricai",
    objections: "objection-handling",
    comparisons: "competitive-comparison",
    "product-updates": "updates",
    "objection-handling": "objection-handling",
    "competitive-comparison": "competitive-comparison",
    "about-ziricai": "about-ziricai",
};

const ENTRY_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n\r?\n## Q:\s*(.+?)\r?\n(?:\r?\n)?\*\*A:\*\*\s*([\s\S]*?)(?=^---\r?\n|^## Q:|$(?![\r\n]))/gm;
const LEGACY_QA_RE = /^## Q:\s*(.+?)\r?\n(?:\r?\n)?\*\*A:\*\*\s*([\s\S]*?)(?=^## Q:|$)/gm;

let _cache = null;
let _cacheMtime = 0;
let _byId = null;

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

function resolveCategoryId(filename) {
    const base = path.basename(filename);
    const manifest = CATEGORY_MANIFEST.find((c) => c.file === base);
    if (manifest) return manifest.id;
    const match = base.match(/^\d{2}_(.+)\.md$/);
    if (match) return match[1].toLowerCase().replace(/_/g, "-");
    return base.replace(/\.md$/, "");
}

function resolveCategoryTitle(categoryId) {
    const normalized = CATEGORY_ALIASES[categoryId] || categoryId;
    const manifest = CATEGORY_MANIFEST.find((c) => c.id === normalized);
    if (manifest) return manifest.title;
    return categoryId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeCategoryFilter(category) {
    if (!category) return null;
    return CATEGORY_ALIASES[category] || category;
}

/** Parse YAML frontmatter block into metadata object */
export function parseFrontmatter(yamlBlock) {
    const meta = {};
    if (!yamlBlock) return meta;

    const lines = yamlBlock.split("\n");
    let currentKey = null;
    let list = null;

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^\s+-\s+/.test(line) && list) {
            list.push(line.replace(/^\s+-\s+/, "").trim());
            continue;
        }
        const m = line.match(/^([\w_]+):\s*(.*)$/);
        if (!m) continue;
        currentKey = m[1];
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (val === "" || val === "[]") {
            list = [];
            meta[currentKey] = list;
        } else {
            meta[currentKey] = val;
            list = null;
        }
    }
    return meta;
}

function extractKeywords(question, answer, explicit = []) {
    const fromMeta = Array.isArray(explicit) ? explicit : [];
    if (fromMeta.length) return fromMeta;
    const text = `${question} ${answer}`.toLowerCase();
    const words = text.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    return [...new Set(words)].slice(0, 20);
}

function normalizeAudience(audience) {
    if (!audience) return ["Customer"];
    if (Array.isArray(audience)) return audience;
    return [String(audience)];
}

/** Parse metadata-rich or legacy markdown Q&A */
export function parseMarkdownQA(content, fileMeta = {}) {
    const pairs = [];
    if (!content) return pairs;

    ENTRY_RE.lastIndex = 0;
    let match;
    let foundMetadata = false;

    while ((match = ENTRY_RE.exec(content)) !== null) {
        foundMetadata = true;
        const fm = parseFrontmatter(match[1]);
        const question = match[2].trim();
        const answer = match[3].trim().replace(/\s+$/g, "");
        if (!question || !answer) continue;

        const categoryId = fileMeta.category || normalizeCategoryFilter(fm.category?.toLowerCase().replace(/\s+/g, "-")) || "general";

        pairs.push({
            id: fm.id || null,
            question,
            answer,
            category: categoryId,
            categoryTitle: resolveCategoryTitle(categoryId),
            subCategory: fm.sub_category || fm.subCategory || "General",
            difficulty: fm.difficulty || "Beginner",
            intent: fm.intent || null,
            keywords: extractKeywords(question, answer, fm.keywords),
            audience: normalizeAudience(fm.audience),
            aiResponseStyle: fm.ai_response_style || fm.aiResponseStyle || null,
            lastUpdated: fm.last_updated || fm.lastUpdated || null,
            related: Array.isArray(fm.related) ? fm.related.filter(Boolean) : [],
            sourceFile: fileMeta.sourceFile || null,
            phase: fileMeta.phase || CATEGORY_MANIFEST.find((c) => c.id === categoryId)?.phase || null,
        });
    }

    if (!foundMetadata) {
        LEGACY_QA_RE.lastIndex = 0;
        while ((match = LEGACY_QA_RE.exec(content)) !== null) {
            const question = match[1].trim();
            const answer = match[2].trim().replace(/\s+$/g, "");
            if (!question || !answer) continue;
            const categoryId = fileMeta.category || "general";
            pairs.push({
                id: null,
                question,
                answer,
                category: categoryId,
                categoryTitle: resolveCategoryTitle(categoryId),
                subCategory: "General",
                difficulty: "Beginner",
                keywords: extractKeywords(question, answer),
                audience: ["Customer"],
                lastUpdated: null,
                related: [],
                sourceFile: fileMeta.sourceFile || null,
                phase: fileMeta.phase || null,
            });
        }
    }

    return pairs;
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

export function loadKnowledgeFile(filename) {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const category = resolveCategoryId(filename);
    const manifest = CATEGORY_MANIFEST.find((c) => c.file === filename);
    const pairs = parseMarkdownQA(content, {
        category,
        sourceFile: filename,
        phase: manifest?.phase || null,
    });
    return injectDynamicAnswers(pairs, category);
}

export function loadAllKnowledgeFiles(options = {}) {
    const { force = false } = options;
    const mtime = getKnowledgeMtime();
    if (!force && _cache && mtime === _cacheMtime) return _cache;

    if (!fs.existsSync(KNOWLEDGE_DIR)) {
        _cache = { files: [], pairs: [], byCategory: {}, byId: {} };
        _byId = {};
        _cacheMtime = mtime;
        return _cache;
    }

    const seenQuestions = new Set();
    const seenIds = new Set();
    const files = [];
    const pairs = [];
    const byCategory = {};
    const byId = {};

    const mdFiles = fs
        .readdirSync(KNOWLEDGE_DIR)
        .filter((f) => f.endsWith(".md") && f !== "README.md" && /^\d{2}_/.test(f))
        .sort((a, b) => {
            const orderA = CATEGORY_MANIFEST.find((c) => c.file === a)?.order ?? 999;
            const orderB = CATEGORY_MANIFEST.find((c) => c.file === b)?.order ?? 999;
            return orderA - orderB || a.localeCompare(b);
        });

    for (const filename of mdFiles) {
        const filePairs = loadKnowledgeFile(filename);
        const category = resolveCategoryId(filename);
        const deduped = [];

        for (const pair of filePairs) {
            const key = pair.question.toLowerCase().trim();
            if (seenQuestions.has(key)) continue;
            seenQuestions.add(key);

            if (pair.id && seenIds.has(pair.id)) continue;
            if (pair.id) {
                seenIds.add(pair.id);
                byId[pair.id] = pair;
            }

            deduped.push(pair);
            pairs.push(pair);
            if (!byCategory[category]) byCategory[category] = [];
            byCategory[category].push(pair);
        }

        files.push({ filename, category, count: deduped.length });
    }

    _cache = { files, pairs, byCategory, byId };
    _byId = byId;
    _cacheMtime = mtime;
    return _cache;
}

export function normalizeQuestionText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CREATOR_VERBS = new Set(["made", "create", "created", "develop", "developed", "found", "founded", "build", "built"]);
const SUCCESS_STORY_SUBCATEGORIES = new Set(["success stories", "case studies", "testimonials", "customer stories"]);
const ABOUT_CATEGORIES = new Set(["about-ziricai", "company"]);
const ABOUT_SUBCATEGORIES = new Set(["about us", "introduction", "company background", "founders"]);

function tokenizeQuery(normalizedQuery) {
    return normalizedQuery.split(" ").filter((w) => w.length > 2);
}

function isCreatorOriginQuestion(normalizedQuery) {
    if (!/\bwho\b/.test(normalizedQuery)) return false;
    const mentionsZiric = normalizedQuery.includes("ziricai") || normalizedQuery.includes("ziric media");
    const hasCreatorVerb = [...CREATOR_VERBS].some((verb) => normalizedQuery.includes(verb));
    const asksWhoIsBehind = normalizedQuery.includes("behind");
    return mentionsZiric && (hasCreatorVerb || asksWhoIsBehind);
}

function creatorVerbMatchesQuery(queryWords, qNorm) {
    const queryVerbs = queryWords.filter((w) => CREATOR_VERBS.has(w));
    if (!queryVerbs.length) return false;
    for (const verb of queryVerbs) {
        if (new RegExp(`\\b${escapeRegExp(verb)}\\b`).test(qNorm)) return true;
    }
    for (const verb of queryVerbs) {
        for (const synonym of CREATOR_VERBS) {
            if (new RegExp(`\\b${escapeRegExp(synonym)}\\b`).test(qNorm)) return true;
        }
    }
    return false;
}

function keywordMatchesWord(word, kwNorm) {
    if (kwNorm === word) return true;
    if (word.length >= 4 && kwNorm.length >= 4) {
        if (kwNorm.includes(word) || word.includes(kwNorm)) return true;
    }
    return false;
}

export function scoreKnowledgeMatch(normalizedQuery, pair, options = {}) {
    if (!normalizedQuery) return 0;
    const { audience = null, subCategory = null } = options;
    const qNorm = normalizeQuestionText(pair.question);
    const aNorm = normalizeQuestionText(pair.answer);
    let score = 0;

    if (qNorm === normalizedQuery) score += 200;
    else if (qNorm.includes(normalizedQuery) || normalizedQuery.includes(qNorm)) score += 80;

    const queryWords = tokenizeQuery(normalizedQuery);
    let questionWordHits = 0;

    for (const word of queryWords) {
        const re = new RegExp(`\\b${escapeRegExp(word)}\\b`);
        if (re.test(qNorm)) {
            score += 18;
            questionWordHits += 1;
        }
        if (re.test(aNorm)) score += 6;
        for (const kw of pair.keywords || []) {
            const kwNorm = normalizeQuestionText(kw);
            if (keywordMatchesWord(word, kwNorm)) score += 8;
        }
    }

    if (normalizedQuery.includes("ziricai") && (qNorm.includes("ziricai") || aNorm.includes("ziricai"))) score += 24;
    if (creatorVerbMatchesQuery(queryWords, qNorm)) score += 20;

    const creatorQuestion = isCreatorOriginQuestion(normalizedQuery);
    const subNorm = normalizeQuestionText(pair.subCategory || "");
    const isSuccessStory = SUCCESS_STORY_SUBCATEGORIES.has(subNorm);
    const isAboutEntry = ABOUT_CATEGORIES.has(pair.category)
        && (ABOUT_SUBCATEGORIES.has(subNorm) || pair.category === "about-ziricai");

    if (creatorQuestion) {
        if (isAboutEntry) score += 35;
        if (isSuccessStory) score -= 50;
        if ((pair.answer || "").length < 180 && isSuccessStory) score -= 25;
        const hasZiricSignal = qNorm.includes("ziricai") || aNorm.includes("ziricai") || aNorm.includes("ziric media");
        if (!hasZiricSignal) score -= 30;
        if (questionWordHits < 2 && !qNorm.includes("ziricai")) score -= 20;
    }

    if (pair.category && normalizedQuery.includes(pair.category.replace(/-/g, " "))) score += 12;
    if (pair.subCategory && normalizedQuery.includes(subNorm)) score += 10;

    if (audience && pair.audience?.some((a) => a.toLowerCase() === audience.toLowerCase())) score += 15;
    if (subCategory && pair.subCategory?.toLowerCase() === subCategory.toLowerCase()) score += 20;

    return score;
}

/**
 * Keyword search across all knowledge Q&A pairs.
 * @param {string} query
 * @param {{ limit?: number, category?: string, subCategory?: string, audience?: string, minScore?: number }} [options]
 */
export function searchKnowledge(query, options = {}) {
    const { limit = 8, category = null, subCategory = null, audience = null, minScore = 12 } = options;
    const normalized = normalizeQuestionText(query);
    const catFilter = normalizeCategoryFilter(category);

    const { pairs } = loadAllKnowledgeFiles();
    let pool = pairs;

    if (catFilter) pool = pool.filter((p) => p.category === catFilter || CATEGORY_ALIASES[p.category] === catFilter);
    if (subCategory) pool = pool.filter((p) => p.subCategory?.toLowerCase() === subCategory.toLowerCase());
    if (audience) pool = pool.filter((p) => p.audience?.some((a) => a.toLowerCase() === audience.toLowerCase()));

    if (!normalized) {
        return pool.slice(0, limit).map((p) => ({ ...p, score: 0 }));
    }

    return pool
        .map((pair) => ({
            ...pair,
            score: scoreKnowledgeMatch(normalized, pair, { audience, subCategory }),
        }))
        .filter((p) => p.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/** Resolve a related reference (KB id or question text) to an entry */
function resolveRelatedRef(ref, data) {
    if (!ref) return null;
    const trimmed = String(ref).trim();
    if (data.byId[trimmed]) return data.byId[trimmed];
    const normalized = normalizeQuestionText(trimmed);
    return data.pairs.find((p) => normalizeQuestionText(p.question) === normalized) || null;
}

/** Get related entries by KB id — resolves related as ids or question text */
export function getRelatedEntries(id, options = {}) {
    const { limit = 5 } = options;
    const data = loadAllKnowledgeFiles();
    const entry = data.byId[id];
    if (!entry) return [];

    const related = [];
    const seen = new Set([id]);

    for (const ref of entry.related || []) {
        const rel = resolveRelatedRef(ref, data);
        if (!rel || seen.has(rel.id)) continue;
        related.push(rel);
        seen.add(rel.id);
    }

    if (related.length < limit) {
        const sameSub = (data.byCategory[entry.category] || []).filter(
            (p) => p.subCategory === entry.subCategory && p.id !== id && !seen.has(p.id)
        );
        for (const p of sameSub.slice(0, limit - related.length)) {
            related.push(p);
            seen.add(p.id);
        }
    }

    return related.slice(0, limit);
}

export function getKnowledgeStats() {
    const data = loadAllKnowledgeFiles();

    const categoryStats = CATEGORY_MANIFEST.map((cat) => ({
        id: cat.id,
        title: cat.title,
        file: cat.file,
        phase: cat.phase,
        phaseTarget: cat.phaseTarget,
        count: (data.byCategory[cat.id] || []).length,
        progressPct: Math.round(((data.byCategory[cat.id] || []).length / cat.phaseTarget) * 10000) / 100,
    }));

    const phaseStats = PHASE_MANIFEST.map((ph) => {
        const count = ph.categories.reduce((sum, catId) => sum + (data.byCategory[catId] || []).length, 0);
        return {
            phase: ph.phase,
            name: ph.name,
            description: ph.description,
            target: ph.target,
            count,
            progressPct: Math.round((count / ph.target) * 10000) / 100,
        };
    });

    const v1ModuleStats = V1_MODULE_MANIFEST.map((mod) => {
        const count = (data.byCategory[mod.id] || []).length;
        return {
            module: mod.module,
            id: mod.id,
            title: mod.title,
            file: mod.file,
            target: mod.target,
            count,
            progressPct: Math.round((count / mod.target) * 10000) / 100,
        };
    });

    const v1Count = data.pairs.length;

    return {
        fileCount: data.files.length,
        questionCount: data.pairs.length,
        categoryCount: categoryStats.filter((c) => c.count > 0).length,
        categories: categoryStats,
        phases: phaseStats,
        v1: {
            target: V1_TARGET,
            count: v1Count,
            progressPct: Math.round((v1Count / V1_TARGET) * 10000) / 100,
            modules: v1ModuleStats,
        },
        files: data.files,
        target: LONG_TERM_TARGET,
        progressPct: Math.round((data.pairs.length / LONG_TERM_TARGET) * 10000) / 100,
        entriesWithMetadata: data.pairs.filter((p) => p.id).length,
        metadataCoveragePct: Math.round((data.pairs.filter((p) => p.id).length / Math.max(data.pairs.length, 1)) * 10000) / 100,
    };
}

export function getPlatformKnowledgeSummary(options = {}) {
    const { query = "", maxChars = 4500, matchLimit = 6, audience = null } = options;
    const stats = getKnowledgeStats();
    const data = loadAllKnowledgeFiles();
    const detailedCategories = new Set(["pricing", "billing", "faq", "tutorials"]);
    const answerLimit = (entry) => {
        const sub = (entry.subCategory || "").toLowerCase();
        if (detailedCategories.has(entry.category) || sub.includes("trial") || sub.includes("setup") || sub.includes("getting started")) {
            return 2000;
        }
        return 220;
    };

    const lines = [
        `ZiricAI Knowledge Base v1.0 (${stats.questionCount} Q&A across ${stats.categoryCount} categories; v1.0 target ${stats.v1?.target?.toLocaleString() || "10,000"}+)`,
        `v1.0 progress: ${stats.v1?.progressPct || 0}% | Metadata coverage: ${stats.metadataCoveragePct}%`,
        "",
        "Categories:",
        ...CATEGORY_MANIFEST.map((c) => {
            const count = (data.byCategory[c.id] || []).length;
            return `  ${c.order}. ${c.title} (${count} Q&A, Phase ${c.phase})`;
        }),
        "",
    ];

    if (query) {
        const matches = searchKnowledge(query, { limit: matchLimit, minScore: 10, audience });
        if (matches.length) {
            lines.push(`Relevant to current question (${matches.length} matches):`);
            for (const m of matches) {
                const aud = m.audience?.length ? ` [${m.audience.join(", ")}]` : "";
                lines.push(`• [${m.id || m.category}] ${m.categoryTitle} / ${m.subCategory}${aud}`);
                lines.push(`  Q: ${m.question}`);
                lines.push(`  A: ${m.answer.slice(0, answerLimit(m))}${m.answer.length > answerLimit(m) ? "…" : ""}`);
                if (m.aiResponseStyle) {
                    lines.push(`  Response style: ${m.aiResponseStyle.slice(0, 180)}${m.aiResponseStyle.length > 180 ? "…" : ""}`);
                }
                if (m.related?.length) {
                    lines.push(`  Related: ${m.related.slice(0, 3).join(", ")}`);
                }
            }
            lines.push("");
        }
    }

    lines.push(`Pricing (canonical): ${getPricingSummaryText()}`);

    let summary = lines.join("\n");
    if (summary.length > maxChars) {
        summary = summary.slice(0, maxChars - 20) + "\n…[truncated]";
    }
    return summary;
}

export function matchPlatformQuestion(text, context = {}) {
    const normalized = normalizeQuestionText(text);
    if (!normalized) return null;

    const matches = searchKnowledge(text, { limit: 1, minScore: 15, audience: context.audience });
    if (matches.length) {
        const best = matches[0];
        return {
            id: best.id || best.category,
            answer: best.answer,
            title: best.categoryTitle,
            question: best.question,
            score: best.score,
            related: best.related,
            audience: best.audience,
            aiResponseStyle: best.aiResponseStyle,
        };
    }

    if (context.lastTopicId) {
        const topicId = normalizeCategoryFilter(context.lastTopicId);
        const categoryPairs = loadAllKnowledgeFiles().byCategory[topicId] || [];
        if (categoryPairs.length) {
            return {
                id: categoryPairs[0].id || topicId,
                answer: categoryPairs[0].answer,
                title: resolveCategoryTitle(topicId),
                question: categoryPairs[0].question,
            };
        }
    }

    return null;
}

export function getPlatformAnswer(topicOrQuestion = "general", context = {}) {
    const topic = String(topicOrQuestion || "").toLowerCase();

    const categoryMap = {
        aiemployee: "ai-employees",
        aiemployees: "ai-employees",
        employees: "ai-employees",
        overview: "about-ziricai",
        general: "about-ziricai",
        about: "about-ziricai",
        features: "about-ziricai",
        trial: "pricing",
        restaurant: "industries",
        knowledge: "about-ziricai",
        sarah: "about-ziricai",
        roi: "sales",
        integrations: "integrations",
        whatsapp: "whatsapp",
        objections: "objection-handling",
        comparisons: "competitive-comparison",
    };

    const categoryId = normalizeCategoryFilter(categoryMap[topic] || topic);
    const data = loadAllKnowledgeFiles();
    const categoryPairs = data.byCategory[categoryId];

    if (categoryPairs?.length) {
        return {
            id: categoryPairs[0].id || categoryId,
            answer: categoryPairs[0].answer,
            title: resolveCategoryTitle(categoryId),
            question: categoryPairs[0].question,
            related: categoryPairs[0].related,
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

export function clearKnowledgeCache() {
    _cache = null;
    _cacheMtime = 0;
    _byId = null;
}

export { getPricingSummaryText, getDefaultPlatformReply, formatPrice, getPlan, getPublicPlans };
