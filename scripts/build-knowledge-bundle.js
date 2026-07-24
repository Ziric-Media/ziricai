#!/usr/bin/env node
/**
 * Parse knowledge/*.md Q&A pairs and emit browser bundle + stats.
 * Run: npm run build:knowledge
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    loadAllKnowledgeFiles,
    getKnowledgeStats,
    CATEGORY_MANIFEST,
    KNOWLEDGE_DIR,
} from "../services/knowledge/platformKnowledgeLoader.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "js/shared/platformKnowledgeData.js");

function syncFlatAliases() {
    const aliasToCanonical = {
        "about.md": "01-about.md",
        "employees.md": "02-ai-employees.md",
        "features.md": "03-features.md",
        "industries.md": "04-industries.md",
        "pricing.md": "05-pricing.md",
        "marketplace.md": "06-marketplace.md",
        "automation.md": "07-automation.md",
        "crm.md": "08-crm.md",
        "analytics.md": "09-analytics.md",
        "whatsapp.md": "10-whatsapp.md",
        "facebook.md": "11-integrations.md",
        "instagram.md": "11-integrations.md",
        "api.md": "12-api.md",
        "billing.md": "21-billing.md",
        "company.md": "23-company.md",
        "support.md": "22-support.md",
        "tutorials.md": "13-tutorials.md",
        "blogs.md": "24-blogs.md",
        "security.md": "15-security.md",
        "comparisons.md": "20-comparisons.md",
        "objections.md": "19-objections.md",
    };

    for (const [alias, canonical] of Object.entries(aliasToCanonical)) {
        const src = path.join(KNOWLEDGE_DIR, canonical);
        const dest = path.join(KNOWLEDGE_DIR, alias);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
        }
    }
}

const RUNTIME_HELPERS = `
export function normalizeQuestionText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\\w\\s?]/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&");
}

export function scoreKnowledgeMatch(normalizedQuery, pair) {
    if (!normalizedQuery) return 0;
    const qNorm = normalizeQuestionText(pair.q);
    const aNorm = normalizeQuestionText(pair.a);
    let score = 0;
    if (qNorm === normalizedQuery) return 200;
    if (qNorm.includes(normalizedQuery) || normalizedQuery.includes(qNorm)) score += 80;
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);
    for (const word of queryWords) {
        const re = new RegExp("\\\\b" + escapeRegExp(word) + "\\\\b");
        if (re.test(qNorm)) score += 18;
        if (re.test(aNorm)) score += 6;
        for (const kw of pair.kw || []) {
            if (kw === word || kw.includes(word)) score += 4;
        }
    }
    if (pair.cat && normalizedQuery.includes(pair.cat.replace(/-/g, " "))) score += 12;
    return score;
}

export function searchKnowledge(query, options = {}) {
    const { limit = 8, category = null, minScore = 12 } = options;
    const normalized = normalizeQuestionText(query);
    if (!normalized) return [];
    const pool = category
        ? PLATFORM_KNOWLEDGE_PAIRS.filter((p) => p.cat === category)
        : PLATFORM_KNOWLEDGE_PAIRS;
    return pool
        .map((pair) => ({ ...pair, score: scoreKnowledgeMatch(normalized, pair) }))
        .filter((p) => p.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function getPlatformKnowledgeSummary(options = {}) {
    const { query = "", maxChars = 4500, matchLimit = 6 } = options;
    const lines = [
        "ZiricAI Knowledge Base (" + PLATFORM_KNOWLEDGE_STATS.questionCount + " Q&A across " + PLATFORM_KNOWLEDGE_STATS.categoryCount + " categories)",
        "",
        "Categories:",
        ...PLATFORM_KNOWLEDGE_MANIFEST.map((c) => "  " + c.order + ". " + c.title + " (" + c.count + " Q&A)"),
        "",
    ];
    if (query) {
        const matches = searchKnowledge(query, { limit: matchLimit, minScore: 10 });
        if (matches.length) {
            lines.push("Relevant matches (" + matches.length + "):");
            for (const m of matches) {
                lines.push("• [" + m.catTitle + "] Q: " + m.q);
                lines.push("  A: " + m.a.slice(0, 220) + (m.a.length > 220 ? "…" : ""));
            }
            lines.push("");
        }
    }
    let summary = lines.join("\\n");
    if (summary.length > maxChars) summary = summary.slice(0, maxChars - 20) + "\\n…[truncated]";
    return summary;
}

export function matchPlatformQuestion(text) {
    const matches = searchKnowledge(text, { limit: 1, minScore: 15 });
    if (!matches.length) return null;
    const best = matches[0];
    return { id: best.cat, answer: best.a, title: best.catTitle, question: best.q, score: best.score };
}

export function getPlatformAnswer(topicOrQuestion = "general") {
    const matched = matchPlatformQuestion(topicOrQuestion);
    if (matched) return matched;
    const categoryPairs = PLATFORM_KNOWLEDGE_PAIRS.filter((p) => p.cat === topicOrQuestion);
    if (categoryPairs.length) {
        return { id: topicOrQuestion, answer: categoryPairs[0].a, title: categoryPairs[0].catTitle };
    }
    return { id: "general", answer: "ZiricAI deploys AI Employees for 24/7 customer enquiries. Ask about pricing, setup, industries, or WhatsApp.", title: "ZiricAI" };
}
`;

function buildBrowserBundle() {
    const data = loadAllKnowledgeFiles({ force: true });
    const stats = getKnowledgeStats();

    const pairs = data.pairs.map((p) => ({
        q: p.question,
        a: p.answer,
        cat: p.category,
        catTitle: p.categoryTitle,
        kw: p.keywords?.slice(0, 30) || [],
    }));

    const manifest = CATEGORY_MANIFEST.map((c) => ({
        id: c.id,
        title: c.title,
        order: c.order,
        count: (data.byCategory[c.id] || []).length,
    }));

    const header = `/**
 * AUTO-GENERATED by scripts/build-knowledge-bundle.js — do not edit manually.
 * Source: knowledge/*.md (${stats.questionCount} Q&A pairs, ${stats.fileCount} files)
 * Regenerate: npm run build:knowledge
 */
`;

    const content =
        header +
        `export const PLATFORM_KNOWLEDGE_STATS = ${JSON.stringify(stats, null, 2)};\n\n` +
        `export const PLATFORM_KNOWLEDGE_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n\n` +
        `export const PLATFORM_KNOWLEDGE_PAIRS = ${JSON.stringify(pairs, null, 2)};\n` +
        RUNTIME_HELPERS;

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, content, "utf8");

    const statsPath = path.join(ROOT, "knowledge/stats.json");
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf8");

    console.log(`✓ Generated ${OUTPUT}`);
    console.log(`  ${stats.questionCount} Q&A pairs from ${stats.fileCount} files`);
    console.log(`  Progress toward 15,000 target: ${stats.progressPct}%`);
    console.log("");
    console.log("Per-file counts:");
    for (const f of stats.files.sort((a, b) => a.filename.localeCompare(b.filename))) {
        console.log(`  ${f.filename.padEnd(28)} ${f.count} Q&A (${f.category})`);
    }

    buildBrowserIife(stats);
}

function buildBrowserIife(stats) {
    const data = loadAllKnowledgeFiles({ force: true });
    const pairsJson = JSON.stringify(
        data.pairs.map((p) => ({ q: p.question, a: p.answer, cat: p.category, catTitle: p.categoryTitle, kw: p.keywords?.slice(0, 30) || [] }))
    );

    const iife = `/**
 * AUTO-GENERATED browser IIFE — do not edit manually.
 * Source: knowledge/*.md (${stats.questionCount} Q&A)
 * Regenerate: npm run build:knowledge
 */
(function (global) {
    'use strict';

    const PAIRS = ${pairsJson};

    const PLATFORM_UNCLEAR_REPLY =
        'I want to make sure I help you properly — could you rephrase that? I can answer questions about what ZiricAI is, pricing, setup, support, industries (including restaurants), WhatsApp integration, security, the free trial, and more.';

    function getDefaultReply() {
        return global.ZiricBillingPlans?.getDefaultPlatformReply?.() ||
            'ZiricAI deploys AI Employees to handle customer enquiries 24/7 on WhatsApp, web, and social. Setup takes under 10 minutes, plans start at R999.99/month, and you get a 14-day free trial.';
    }

    function normalizeQuestionText(text) {
        return String(text || '').toLowerCase().replace(/[^\\w\\s?]/g, ' ').replace(/\\s+/g, ' ').trim();
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&');
    }

    function scoreMatch(normalized, pair) {
        if (!normalized) return 0;
        const qNorm = normalizeQuestionText(pair.q);
        const aNorm = normalizeQuestionText(pair.a);
        let score = 0;
        if (qNorm === normalized) return 200;
        if (qNorm.includes(normalized) || normalized.includes(qNorm)) score += 80;
        const words = normalized.split(' ').filter((w) => w.length > 2);
        for (const word of words) {
            const re = new RegExp('\\\\b' + escapeRegExp(word) + '\\\\b');
            if (re.test(qNorm)) score += 18;
            if (re.test(aNorm)) score += 6;
        }
        return score;
    }

    function searchKnowledge(query, limit) {
        const normalized = normalizeQuestionText(query);
        if (!normalized) return [];
        return PAIRS.map((p) => ({ ...p, score: scoreMatch(normalized, p) }))
            .filter((p) => p.score >= 12)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit || 5);
    }

    function matchPlatformQuestion(text, context) {
        context = context || {};
        const matches = searchKnowledge(text, 1);
        if (matches.length) {
            const best = matches[0];
            return { id: best.cat, answer: best.a, title: best.catTitle };
        }
        if (context.lastTopicId) {
            const catPair = PAIRS.find((p) => p.cat === context.lastTopicId);
            if (catPair) return { id: context.lastTopicId, answer: catPair.a, title: catPair.catTitle };
        }
        return null;
    }

    function formatReplyForQuestion(id, answer) { return answer || getDefaultReply(); }

    global.ZiricPlatformKnowledge = {
        matchPlatformQuestion,
        getDefaultReply,
        formatReplyForQuestion,
        normalizeQuestionText,
        searchKnowledge,
        PLATFORM_UNCLEAR_REPLY,
        stats: { questionCount: ${stats.questionCount}, categoryCount: ${stats.categoryCount} },
    };
})(typeof window !== 'undefined' ? window : globalThis);
`;

    const browserPath = path.join(ROOT, "js/shared/platformKnowledge.browser.js");
    fs.writeFileSync(browserPath, iife, "utf8");
    console.log(`✓ Generated ${browserPath}`);
}

syncFlatAliases();
buildBrowserBundle();
