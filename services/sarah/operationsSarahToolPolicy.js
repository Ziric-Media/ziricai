/**
 * Sarah Ops — server-side tool allowlist (default deny when operationsSarah active).
 */
import { SARAH_PERSONA } from "./sarahPersona.js";
import { isPortalClientSurface, PORTAL_SARAH_SURFACES } from "./portalSarahSurfaces.js";
import { readSarahPageContextFromRequest } from "./financeSarahToolPolicy.js";

export const OPERATIONS_SARAH_TOOL_DENIED = "OPERATIONS_SARAH_TOOL_DENIED";

export const SARAH_SESSION_MODULE_SCOPE_OPERATIONS = "operations";

/** @type {ReadonlySet<string>} */
export const OPERATIONS_SARAH_ALLOWED_TOOL_NAMES = new Set([
    "platformHelp",
    "listTasks",
    "createTask",
    "updateTask",
    "listWorkforceInstructions",
    "completeWorkforceInstruction",
]);

export const OPERATIONS_SARAH_PROHIBITED_TOOL_EXAMPLES = [
    "generateQuote",
    "viewFinanceOverviewSummary",
    "createEmployee",
    "viewBilling",
    "prepareFinanceInvoiceDraft",
    "connectWhatsApp",
];

/**
 * @param {{ persona?: string, surface?: string, uid?: string|null, pageContext?: object|null }} input
 */
export function resolveOperationsSarahActive(input) {
    const persona = input.persona;
    const surface = String(input.surface || "portal").toLowerCase();
    if (persona !== SARAH_PERSONA.CLIENT_OPERATOR) return false;
    if (!isPortalClientSurface(surface)) return false;
    if (!input.uid) return false;

    if (surface === PORTAL_SARAH_SURFACES.OPERATIONS) return true;

    const pc = input.pageContext;
    if (!pc || typeof pc !== "object" || Array.isArray(pc)) return false;
    return pc.module === "operations";
}

export function resolveOperationsSarahForChat(ctx, session) {
    const fromPage = resolveOperationsSarahActive({
        persona: ctx?.persona,
        surface: ctx?.surface,
        uid: ctx?.uid,
        pageContext: ctx?.pageContext,
    });
    const sessionScope = session?.context?.sarahModuleScope;
    const fromSession =
        sessionScope === SARAH_SESSION_MODULE_SCOPE_OPERATIONS &&
        ctx?.persona === SARAH_PERSONA.CLIENT_OPERATOR &&
        isPortalClientSurface(ctx?.surface) &&
        Boolean(ctx?.uid);
    return fromPage || fromSession;
}

export function applyOperationsSarahSessionStickiness(ctx, session) {
    const active = resolveOperationsSarahForChat(ctx, session);
    ctx.operationsSarah = active;
    return active;
}

export function shouldPersistOperationsSessionScope(ctx) {
    return resolveOperationsSarahActive({
        persona: ctx?.persona,
        surface: ctx?.surface,
        uid: ctx?.uid,
        pageContext: ctx?.pageContext,
    });
}

export function resolveSarahToolCatalogueInputsOperations(input) {
    const req = { query: input.query || {}, body: input.body || {} };
    const pageContext = readSarahPageContextFromRequest(req);
    const operationsSarah = resolveOperationsSarahActive({
        persona: input.persona,
        surface: input.surface || "portal",
        uid: input.uid,
        pageContext,
    });
    return { pageContext, operationsSarah };
}

/**
 * @param {string} toolName
 * @param {{ operationsSarah?: boolean }} ctx
 */
export function isToolAllowedInOperationsSarah(toolName, ctx) {
    if (!ctx?.operationsSarah) return true;
    return OPERATIONS_SARAH_ALLOWED_TOOL_NAMES.has(toolName);
}
