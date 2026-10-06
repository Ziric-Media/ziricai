/**
 * PI-4F-2 — Correlate support conversations to a single open case (no case spam).
 */
import { createSupportCase, listSupportCasesPage } from "../tenants/supportCaseService.js";
import { normalizeLifecycleStatus } from "./supportCaseModel.js";

const OPEN_LIKE = new Set(["open", "investigating", "assigned", "waiting", "escalated", "human_action"]);

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
}

function overlapScore(a, b) {
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    if (!ta.size || !tb.size) return 0;
    let hit = 0;
    for (const t of ta) {
        if (tb.has(t)) hit += 1;
    }
    return hit / Math.max(ta.size, tb.size);
}

/**
 * @param {string} companyId
 * @param {{ affectedService?: string, issueText?: string, conversationId?: string, sessionCaseId?: string }} criteria
 */
export async function findCorrelatedSupportCase(companyId, criteria = {}) {
    const sessionCaseId = criteria.sessionCaseId ? String(criteria.sessionCaseId) : null;
    if (sessionCaseId) {
        const page = await listSupportCasesPage(companyId, { limit: 30 });
        const hit = page.items.find((c) => c.id === sessionCaseId && OPEN_LIKE.has(c.status));
        if (hit) return hit;
    }

    const page = await listSupportCasesPage(companyId, { limit: 30 });
    const openCases = page.items.filter((c) => OPEN_LIKE.has(normalizeLifecycleStatus(c.status)));

    const service = criteria.affectedService ? String(criteria.affectedService).toLowerCase() : null;
    const issueText = criteria.issueText || "";

    let best = null;
    let bestScore = 0;

    for (const c of openCases) {
        let score = 0;
        if (service && c.affectedService === service) score += 0.5;
        if (criteria.conversationId && c.conversationId === criteria.conversationId) score += 1;
        score += overlapScore(issueText, c.issue || c.subject);
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }

    if (best && bestScore >= 0.35) return best;
    if (service) {
        const serviceOnly = openCases.find((c) => c.affectedService === service);
        if (serviceOnly) return serviceOnly;
    }
    return null;
}

/**
 * @returns {Promise<{ supportCase: object, correlated: boolean }>}
 */
export async function upsertCorrelatedSupportCase(companyId, input, ctx = {}) {
    const existing = await findCorrelatedSupportCase(companyId, {
        affectedService: input.affectedService,
        issueText: input.issue || input.subject,
        conversationId: input.conversationId,
        sessionCaseId: input.sessionCaseId,
    });

    if (existing) {
        return { supportCase: existing, correlated: true };
    }

    const created = await createSupportCase(
        companyId,
        {
            subject: input.subject || input.issue || "Support issue",
            issue: input.issue || input.subject,
            category: input.category || "general",
            severity: input.severity,
            priority: input.priority,
            affectedService: input.affectedService,
            source: input.source || "sarah",
            conversationId: input.conversationId || null,
        },
        ctx
    );
    return { supportCase: created, correlated: false };
}
