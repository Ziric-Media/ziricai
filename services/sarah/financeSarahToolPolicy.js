/**
 * F-Sarah G1 — Finance Sarah server-side tool allowlist (default deny).
 * Restricts model schema + executeTool when financeSarah mode is active.
 */
import { SARAH_PERSONA } from "./sarahPersona.js";
import { isPortalClientSurface, PORTAL_SARAH_SURFACES } from "./portalSarahSurfaces.js";
import { isFinanceSarahPaymentsEnabled } from "../finance/financeSarahPaymentsGate.js";

/** Stable rejection code for dispatch boundary tests. */
export const FINANCE_SARAH_TOOL_DENIED = "FINANCE_SARAH_TOOL_DENIED";

/** Server-persisted Sarah session scope (set only after validated Finance pageContext on chat). */
export const SARAH_SESSION_MODULE_SCOPE_FINANCE = "finance";

/**
 * Explicit allowlist for Finance Sarah (F1 read + F2 confirm-gated writes).
 * @type {ReadonlySet<string>}
 */
export const FINANCE_SARAH_ALLOWED_TOOL_NAMES = new Set([
    "platformHelp",
    "viewFinanceOverviewSummary",
    "viewOutstandingInvoices",
    "viewInvoiceAging",
    "viewInvoiceDetails",
    "viewFinanceTransactions",
    "viewFinanceChartOfAccounts",
    "viewFinanceTrialBalance",
    "viewFinanceJournalEntries",
    "prepareFinanceInvoiceDraft",
    "prepareFinanceQuotationDraft",
    "prepareFinanceLedgerEntryDraft",
    "prepareFinanceManualJournalDraft",
    "confirmFinanceWrite",
    "listWorkforceInstructions",
    "completeWorkforceInstruction",
    "listBosCommercialCycles",
]);

/** Representative tools that must never appear in Finance Sarah (negative test guard). */
export const FINANCE_SARAH_PROHIBITED_TOOL_EXAMPLES = [
    "generateQuote",
    "createTask",
    "createEmployee",
    "connectWhatsApp",
    "viewBilling",
    "generateReport",
];

/**
 * Parse pageContext from request (chat body or tools query JSON). Descriptive only — not used for tenant auth.
 * @param {import('express').Request} [req]
 * @returns {object|null}
 */
export function readSarahPageContextFromRequest(req) {
    if (!req) return null;
    if (req.body?.pageContext && typeof req.body.pageContext === "object") {
        return req.body.pageContext;
    }
    const raw = req.query?.pageContext;
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

/**
 * Server-derived Finance Sarah mode — restricts tools only; never elevates access.
 * Requires authenticated portal tenant chat with consistent Finance pageContext markers.
 *
 * @param {{ persona?: string, surface?: string, uid?: string|null, pageContext?: object|null }} input
 */
export function resolveFinanceSarahActive(input) {
    const persona = input.persona;
    const surface = String(input.surface || "portal").toLowerCase();
    if (persona !== SARAH_PERSONA.CLIENT_OPERATOR) return false;
    if (!isPortalClientSurface(surface)) return false;
    if (!input.uid) return false;

    if (surface === PORTAL_SARAH_SURFACES.FINANCE) return true;

    const pc = input.pageContext;
    if (!pc || typeof pc !== "object" || Array.isArray(pc)) return false;
    if (pc.module !== "finance") return false;
    if (pc.page !== "finance") return false;

    // Client-supplied privilege hints are ignored (role, financeSarah, toolPolicy, etc.).
    return true;
}

/**
 * Finance Sarah tool policy for a chat turn — pageContext and/or server-stored session scope.
 * Session scope is written only by the orchestrator after a validated Finance pageContext turn.
 *
 * @param {object} ctx — Sarah context (persona, surface, uid, pageContext)
 * @param {{ context?: object } | null | undefined} [session]
 */
export function resolveFinanceSarahForChat(ctx, session) {
    const fromPage = resolveFinanceSarahActive({
        persona: ctx?.persona,
        surface: ctx?.surface,
        uid: ctx?.uid,
        pageContext: ctx?.pageContext,
    });
    const sessionScope = session?.context?.sarahModuleScope;
    const fromSession =
        sessionScope === SARAH_SESSION_MODULE_SCOPE_FINANCE &&
        ctx?.persona === SARAH_PERSONA.CLIENT_OPERATOR &&
        isPortalClientSurface(ctx?.surface) &&
        Boolean(ctx?.uid);
    return fromPage || fromSession;
}

/**
 * Apply Finance Sarah stickiness on ctx for tool schema + executeTool (chat handler).
 * @param {object} ctx
 * @param {{ context?: object } | null | undefined} [session]
 * @returns {boolean} financeSarah active after resolution
 */
export function applyFinanceSarahSessionStickiness(ctx, session) {
    const active = resolveFinanceSarahForChat(ctx, session);
    ctx.financeSarah = active;
    return active;
}

/** True when this turn should persist Finance scope onto the Sarah session (server-side only). */
export function shouldPersistFinanceSessionScope(ctx) {
    return resolveFinanceSarahActive({
        persona: ctx?.persona,
        surface: ctx?.surface,
        uid: ctx?.uid,
        pageContext: ctx?.pageContext,
    });
}

/**
 * Resolve catalogue inputs the same way as buildSarahContext + GET /api/sarah/tools (no HTTP).
 * @param {{ persona?: string, surface?: string, uid?: string|null, role?: string, query?: object, body?: object }}
 */
export function resolveSarahToolCatalogueInputs(input) {
    const req = { query: input.query || {}, body: input.body || {} };
    const pageContext = readSarahPageContextFromRequest(req);
    const persona = input.persona;
    const surface = input.surface || "portal";
    const financeSarah = resolveFinanceSarahActive({
        persona,
        surface,
        uid: input.uid,
        pageContext,
    });
    return { pageContext, financeSarah };
}

/**
 * @param {string} toolName
 * @param {{ financeSarah?: boolean }} ctx
 */
export function isToolAllowedInFinanceSarah(toolName, ctx) {
    if (!ctx?.financeSarah) return true;
    if (FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(toolName)) return true;
    if (toolName === "prepareFinanceInvoicePaymentDraft" && isFinanceSarahPaymentsEnabled()) return true;
    return false;
}

/** User asks about cash collected / receipts — must not be answered with unpaid AR alone. */
const FINANCE_COLLECTIONS_QUESTION_RE =
    /\b(collect(ed|ion|ions)?|received from customers?|cash from sales|money (we|you)('ve| have) (collected|received)|receipts from customers?|customer payments? received|how much (have we|did we) (collect|receive))\b/i;

export function isFinanceCollectionsQuestion(message) {
    return FINANCE_COLLECTIONS_QUESTION_RE.test(String(message || ""));
}

/**
 * Per-turn system addendum for Finance Sarah (MVP honest reporting).
 * @param {{ financeSarah?: boolean }} ctx
 * @param {string} message
 */
export function financeSarahTurnSystemAddendum(ctx, message) {
    if (!ctx?.financeSarah) return "";
    if (isFinanceCollectionsQuestion(message)) {
        return "\n\n[TURN ROUTING — mandatory] This question is about **money collected / posted income**, not unpaid invoices. Call **viewFinanceTransactions** (and/or viewFinanceOverviewSummary) before answering. Do **not** use viewOutstandingInvoices as the answer. Distinguish posted income from bank balance.";
    }
    return "";
}
