/**
 * Session-scoped Finance Sarah write drafts (F2) — one pending draft per Sarah session.
 */
import { randomUUID } from "node:crypto";
import { getSessionContext, setSessionContext } from "./sarahMemory.js";

export const FINANCE_SARAH_DRAFT_TTL_MS = 30 * 60 * 1000;

function requireSession(ctx) {
    const session = ctx?.sarahSession;
    if (!session?.id) {
        throw Object.assign(new Error("Sarah session is required for Finance write drafts."), {
            code: "FINANCE_DRAFT_NO_SESSION",
            status: 400,
        });
    }
    return session;
}

/**
 * @param {object} ctx
 * @param {{ kind: string, preview: object, createBody: object, summary: string }} draft
 */
export async function putFinanceSarahDraft(ctx, draft) {
    const session = requireSession(ctx);
    const draftId = randomUUID().replace(/-/g, "").slice(0, 12);
    const now = Date.now();
    const entry = {
        draftId,
        kind: draft.kind,
        preview: draft.preview,
        createBody: draft.createBody,
        summary: draft.summary,
        companyId: ctx.companyId,
        createdAt: now,
        expiresAt: now + FINANCE_SARAH_DRAFT_TTL_MS,
    };
    await setSessionContext(session, { financeSarahPendingDraft: entry });
    return entry;
}

/**
 * @param {object} ctx
 * @param {string} draftId
 */
export function getFinanceSarahDraft(ctx, draftId) {
    if (!ctx?.sarahSession) return null;
    const entry = getSessionContext(ctx.sarahSession)?.financeSarahPendingDraft;
    if (!entry || entry.draftId !== draftId) return null;
    if (Date.now() > entry.expiresAt) return null;
    if (entry.companyId && ctx.companyId && entry.companyId !== ctx.companyId) return null;
    return entry;
}

export async function clearFinanceSarahDraft(ctx) {
    if (!ctx?.sarahSession) return;
    await setSessionContext(ctx.sarahSession, { financeSarahPendingDraft: null });
}
