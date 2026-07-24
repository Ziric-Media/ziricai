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
    PHASE_MANIFEST,
    KNOWLEDGE_DIR,
} from "../services/knowledge/platformKnowledgeLoader.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "js/shared/platformKnowledgeData.js");

const SYNC_TARGETS = [
    "js/shared/platformKnowledgeData.js",
    "js/shared/platformKnowledge.browser.js",
    "marketing/js/shared/platformKnowledgeData.js",
    "marketing/js/shared/platformKnowledge.browser.js",
    "admin/js/shared/platformKnowledgeData.js",
    "admin/js/shared/platformKnowledge.browser.js",
    "app/js/shared/platformKnowledgeData.js",
    "app/js/shared/platformKnowledge.browser.js",
];

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

export function scoreKnowledgeMatch(normalizedQuery, pair, options = {}) {
    if (!normalizedQuery) return 0;
    const { audience = null, subCategory = null } = options;
    const qNorm = normalizeQuestionText(pair.q);
    const aNorm = normalizeQuestionText(pair.a);
    let score = 0;
    if (qNorm === normalizedQuery) score += 200;
    else if (qNorm.includes(normalizedQuery) || normalizedQuery.includes(qNorm)) score += 80;
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);
    for (const word of queryWords) {
        const re = new RegExp("\\\\b" + escapeRegExp(word) + "\\\\b");
        if (re.test(qNorm)) score += 18;
        if (re.test(aNorm)) score += 6;
        for (const kw of pair.kw || []) {
            const kwNorm = normalizeQuestionText(kw);
            if (kwNorm === word || kwNorm.includes(word)) score += 8;
        }
    }
    if (pair.cat && normalizedQuery.includes(pair.cat.replace(/-/g, " "))) score += 12;
    if (pair.sub && normalizedQuery.includes(normalizeQuestionText(pair.sub))) score += 10;
    if (audience && pair.aud?.some((a) => a.toLowerCase() === audience.toLowerCase())) score += 15;
    if (subCategory && pair.sub?.toLowerCase() === subCategory.toLowerCase()) score += 20;
    return score;
}

export function searchKnowledge(query, options = {}) {
    const { limit = 8, category = null, subCategory = null, audience = null, minScore = 12 } = options;
    const normalized = normalizeQuestionText(query);
    let pool = PLATFORM_KNOWLEDGE_PAIRS;
    if (category) pool = pool.filter((p) => p.cat === category);
    if (subCategory) pool = pool.filter((p) => p.sub?.toLowerCase() === subCategory.toLowerCase());
    if (audience) pool = pool.filter((p) => p.aud?.some((a) => a.toLowerCase() === audience.toLowerCase()));
    if (!normalized) return pool.slice(0, limit).map((p) => ({ ...p, score: 0 }));
    return pool
        .map((pair) => ({ ...pair, score: scoreKnowledgeMatch(normalized, pair, { audience, subCategory }) }))
        .filter((p) => p.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function getRelatedEntries(id, options = {}) {
    const { limit = 5 } = options;
    const entry = PLATFORM_KNOWLEDGE_BY_ID[id];
    if (!entry) return [];
    const related = [];
    const seen = new Set([id]);
    for (const relId of entry.rel || []) {
        if (seen.has(relId)) continue;
        const rel = PLATFORM_KNOWLEDGE_BY_ID[relId];
        if (rel) { related.push(rel); seen.add(relId); }
    }
    if (related.length < limit) {
        const sameSub = PLATFORM_KNOWLEDGE_PAIRS.filter(
            (p) => p.cat === entry.cat && p.sub === entry.sub && p.id !== id && !seen.has(p.id)
        );
        for (const p of sameSub.slice(0, limit - related.length)) {
            related.push(p);
            seen.add(p.id);
        }
    }
    return related.slice(0, limit);
}

export function getPlatformKnowledgeSummary(options = {}) {
    const { query = "", maxChars = 4500, matchLimit = 6, audience = null } = options;
    const lines = [
        "ZiricAI Knowledge Base (" + PLATFORM_KNOWLEDGE_STATS.questionCount + " Q&A, metadata " + PLATFORM_KNOWLEDGE_STATS.metadataCoveragePct + "%)",
        "",
        "Categories:",
        ...PLATFORM_KNOWLEDGE_MANIFEST.map((c) => "  " + c.order + ". " + c.title + " (" + c.count + " Q&A, Phase " + c.phase + ")"),
        "",
    ];
    if (query) {
        const matches = searchKnowledge(query, { limit: matchLimit, minScore: 10, audience });
        if (matches.length) {
            lines.push("Relevant matches (" + matches.length + "):");
            for (const m of matches) {
                const aud = m.aud?.length ? " [" + m.aud.join(", ") + "]" : "";
                lines.push("• [" + (m.id || m.cat) + "] " + m.catTitle + " / " + m.sub + aud);
                lines.push("  Q: " + m.q);
                lines.push("  A: " + m.a.slice(0, 220) + (m.a.length > 220 ? "…" : ""));
                if (m.rel?.length) lines.push("  Related: " + m.rel.slice(0, 3).join(", "));
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
    return { id: best.id || best.cat, answer: best.a, title: best.catTitle, question: best.q, score: best.score, related: best.rel, audience: best.aud };
}

export function getPlatformAnswer(topicOrQuestion = "general") {
    const matched = matchPlatformQuestion(topicOrQuestion);
    if (matched) return matched;
    const categoryPairs = PLATFORM_KNOWLEDGE_PAIRS.filter((p) => p.cat === topicOrQuestion);
    if (categoryPairs.length) {
        return { id: categoryPairs[0].id || topicOrQuestion, answer: categoryPairs[0].a, title: categoryPairs[0].catTitle, related: categoryPairs[0].rel };
    }
    return { id: "general", answer: "ZiricAI deploys AI Employees for 24/7 customer enquiries. Ask about pricing, setup, industries, or WhatsApp.", title: "ZiricAI" };
}
`;

function buildBrowserBundle() {
    const data = loadAllKnowledgeFiles({ force: true });
    const stats = getKnowledgeStats();

    const pairs = data.pairs.map((p) => ({
        id: p.id,
        q: p.question,
        a: p.answer,
        cat: p.category,
        catTitle: p.categoryTitle,
        sub: p.subCategory,
        diff: p.difficulty,
        kw: p.keywords?.slice(0, 30) || [],
        aud: p.audience || [],
        rel: p.related || [],
        phase: p.phase,
        updated: p.lastUpdated,
    }));

    const byId = {};
    for (const p of pairs) {
        if (p.id) byId[p.id] = p;
    }

    const manifest = CATEGORY_MANIFEST.map((c) => ({
        id: c.id,
        title: c.title,
        order: c.order,
        file: c.file,
        phase: c.phase,
        phaseTarget: c.phaseTarget,
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
        `export const PLATFORM_KNOWLEDGE_PHASES = ${JSON.stringify(PHASE_MANIFEST, null, 2)};\n\n` +
        `export const PLATFORM_KNOWLEDGE_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n\n` +
        `export const PLATFORM_KNOWLEDGE_BY_ID = ${JSON.stringify(byId, null, 2)};\n\n` +
        `export const PLATFORM_KNOWLEDGE_PAIRS = ${JSON.stringify(pairs, null, 2)};\n` +
        RUNTIME_HELPERS;

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, content, "utf8");

    const statsPath = path.join(ROOT, "knowledge/stats.json");
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf8");

    console.log(`✓ Generated ${OUTPUT}`);
    console.log(`  ${stats.questionCount} Q&A pairs from ${stats.fileCount} files`);
    console.log(`  Metadata coverage: ${stats.metadataCoveragePct}%`);
    console.log(`  Progress toward ${stats.target.toLocaleString()} target: ${stats.progressPct}%`);
    console.log("");
    console.log("Phase progress:");
    for (const ph of stats.phases) {
        console.log(`  Phase ${ph.phase} ${ph.name}: ${ph.count}/${ph.target} (${ph.progressPct}%)`);
    }
    console.log("");
    console.log("Per-file counts:");
    for (const f of stats.files.sort((a, b) => a.filename.localeCompare(b.filename))) {
        console.log(`  ${f.filename.padEnd(32)} ${f.count} Q&A (${f.category})`);
    }

    buildBrowserIife(stats, pairs, byId);
    syncBundles();
}

function buildBrowserIife(stats, pairs, byId) {
    const pairsJson = JSON.stringify(pairs);
    const byIdJson = JSON.stringify(byId);

    const iife = `/**
 * AUTO-GENERATED browser IIFE — do not edit manually.
 * Source: knowledge/*.md (${stats.questionCount} Q&A)
 * Regenerate: npm run build:knowledge
 */
(function (global) {
    'use strict';

    const PAIRS = ${pairsJson};
    const BY_ID = ${byIdJson};

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

    function scoreMatch(normalized, pair, opts) {
        opts = opts || {};
        if (!normalized) return 0;
        const qNorm = normalizeQuestionText(pair.q);
        const aNorm = normalizeQuestionText(pair.a);
        let score = 0;
        if (qNorm === normalized) score += 200;
        else if (qNorm.includes(normalized) || normalized.includes(qNorm)) score += 80;
        const words = normalized.split(' ').filter(function(w) { return w.length > 2; });
        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            var re = new RegExp('\\\\b' + escapeRegExp(word) + '\\\\b');
            if (re.test(qNorm)) score += 18;
            if (re.test(aNorm)) score += 6;
            if (pair.kw) {
                for (var j = 0; j < pair.kw.length; j++) {
                    var kw = normalizeQuestionText(pair.kw[j]);
                    if (kw === word || kw.indexOf(word) >= 0) score += 8;
                }
            }
        }
        if (opts.audience && pair.aud && pair.aud.some(function(a) { return a.toLowerCase() === opts.audience.toLowerCase(); })) score += 15;
        return score;
    }

    function searchKnowledge(query, opts) {
        opts = opts || {};
        var limit = opts.limit || 5;
        var audience = opts.audience || null;
        var category = opts.category || null;
        var normalized = normalizeQuestionText(query);
        var pool = PAIRS;
        if (category) pool = pool.filter(function(p) { return p.cat === category; });
        if (audience) pool = pool.filter(function(p) { return p.aud && p.aud.some(function(a) { return a.toLowerCase() === audience.toLowerCase(); }); });
        if (!normalized) return pool.slice(0, limit);
        return pool.map(function(p) { return Object.assign({}, p, { score: scoreMatch(normalized, p, opts); }); })
            .filter(function(p) { return p.score >= 12; })
            .sort(function(a, b) { return b.score - a.score; })
            .slice(0, limit);
    }

    function getRelatedEntries(id, limit) {
        limit = limit || 5;
        var entry = BY_ID[id];
        if (!entry) return [];
        var related = [];
        var seen = {};
        seen[id] = true;
        (entry.rel || []).forEach(function(relId) {
            if (seen[relId]) return;
            var rel = BY_ID[relId];
            if (rel) { related.push(rel); seen[relId] = true; }
        });
        return related.slice(0, limit);
    }

    function matchPlatformQuestion(text, context) {
        context = context || {};
        var matches = searchKnowledge(text, { limit: 1, audience: context.audience });
        if (matches.length) {
            var best = matches[0];
            return { id: best.id || best.cat, answer: best.a, title: best.catTitle, question: best.q, related: best.rel, audience: best.aud };
        }
        if (context.lastTopicId) {
            var catPair = PAIRS.find(function(p) { return p.cat === context.lastTopicId; });
            if (catPair) return { id: catPair.id || context.lastTopicId, answer: catPair.a, title: catPair.catTitle };
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
        getRelatedEntries,
        PLATFORM_UNCLEAR_REPLY,
        stats: { questionCount: ${stats.questionCount}, categoryCount: ${stats.categoryCount}, metadataCoveragePct: ${stats.metadataCoveragePct} },
    };
})(typeof window !== 'undefined' ? window : globalThis);
`;

    const browserPath = path.join(ROOT, "js/shared/platformKnowledge.browser.js");
    fs.writeFileSync(browserPath, iife, "utf8");
    console.log(`✓ Generated ${browserPath}`);
}

function syncBundles() {
    const dataSrc = path.join(ROOT, "js/shared/platformKnowledgeData.js");
    const browserSrc = path.join(ROOT, "js/shared/platformKnowledge.browser.js");
    for (const rel of SYNC_TARGETS) {
        if (rel.startsWith("js/shared/")) continue;
        const dest = path.join(ROOT, rel);
        const src = rel.includes("platformKnowledgeData") ? dataSrc : browserSrc;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
    console.log("✓ Synced bundles to marketing/, admin/, app/");
}

buildBrowserBundle();
