/**
 * Mission Control Sarah — platform vs tenant scope and read-only tool policy.
 */
import { SARAH_PERSONA } from "./sarahPersona.js";

/** Firestore/memory session partition when no tenant is selected (not a real tenant). */
export const MISSION_CONTROL_PLATFORM_SESSION_COMPANY_ID = "__mc_platform__";

export const MC_SCOPE = {
    PLATFORM: "platform",
    TENANT: "tenant",
};

/** Mutations and portal-only tools — never available on Mission Control Sarah (Phase 1). */
/** Portal support case mutations — never on Mission Control Sarah. */
export const MC_BLOCKED_SUPPORT_CASE_TOOLS = new Set([
    "investigateSupportIssue",
    "recordSupportDiagnosis",
    "appendRemediationAttempt",
    "escalateSupportCase",
    "resolveSupportCaseWithVerification",
    "retryFailedWebhook",
    "restartStuckAgent",
    "refreshIntegrationState",
]);

export const PLATFORM_OPERATOR_BLOCKED_TOOLS = new Set([
    "createEmployee",
    "connectWhatsApp",
    "connectFacebook",
    "connectInstagram",
    "uploadKnowledge",
    "trainAI",
    "inviteUser",
    "manageTeam",
    "createAutomation",
    "connectIntegration",
    "navigatePortal",
    "bookAppointment",
    "generateQuote",
    "generateReport",
]);

/** Non–platform-only tools allowed when investigating a scoped tenant. */
export const MC_TENANT_READ_TOOLS = new Set([
    "viewWorkspaceOverview",
    "describeAiEmployee",
    "diagnoseWhatsAppIntegration",
    "viewWebhookStatus",
    "viewAiEmployeeStatus",
    "viewKnowledgeBaseStatus",
    "viewRecentErrors",
    "viewRecentMessages",
    "viewSupportHistory",
    "viewAnalytics",
    "viewConversations",
    "searchCRM",
    "viewBilling",
    "viewRecentActivity",
    "searchCompanyKnowledge",
    "platformHelp",
    "navigateMissionControl",
]);

/** Allowed when operating platform-wide (no tenant selected). */
export const MC_PLATFORM_WIDE_TOOLS = new Set([
    "platformHelp",
    "viewPlatformExecutiveOverview",
    "viewPlatformBillingConsole",
    "viewPlatformIntegrationsBoard",
    "viewPlatformSupportCases",
    "viewPlatformSupportOperations",
    "viewPlatformSupportAttention",
    "viewPlatformAnalyticsOverview",
    "viewPlatformCommunications",
    "viewPlatformUserNetwork",
    "viewOrganisationNetwork",
    "viewSectorBreakdown",
    "comparePlatformPeriods",
    "generatePlatformOperationsReport",
    "viewTenantOperatorSummary",
    "navigateMissionControl",
]);

/**
 * @param {string|null|undefined} companyIdFromRequest
 * @returns {'platform'|'tenant'}
 */
export function resolveMcScopeMode(companyIdFromRequest) {
    const id = String(companyIdFromRequest || "").trim();
    return id ? MC_SCOPE.TENANT : MC_SCOPE.PLATFORM;
}

/**
 * @param {object} ctx Sarah context
 * @returns {boolean}
 */
export function isMissionControlOperator(ctx) {
    return ctx?.persona === SARAH_PERSONA.PLATFORM_OPERATOR;
}

/**
 * @param {object} ctx
 * @param {{ name: string, platformOnly?: boolean }} tool
 */
export function isToolAllowedForMissionControl(ctx, tool) {
    if (!isMissionControlOperator(ctx)) return true;
    if (!tool?.name) return false;
    if (PLATFORM_OPERATOR_BLOCKED_TOOLS.has(tool.name)) return false;
    if (MC_BLOCKED_SUPPORT_CASE_TOOLS.has(tool.name)) return false;

    const scope = ctx.mcScopeMode || MC_SCOPE.PLATFORM;
    if (tool.platformOnly) return true;
    if (scope === MC_SCOPE.PLATFORM) {
        return MC_PLATFORM_WIDE_TOOLS.has(tool.name);
    }
    return MC_TENANT_READ_TOOLS.has(tool.name);
}

/**
 * @param {import('./tools/types.js').SarahToolDefinition[]} tools
 * @param {object} ctx
 */
export function filterToolsForMissionControl(tools, ctx) {
    if (!isMissionControlOperator(ctx)) return tools;
    return tools.filter((t) => isToolAllowedForMissionControl(ctx, t));
}

export function missionControlSessionCompanyId(companyId) {
    const id = String(companyId || "").trim();
    return id || MISSION_CONTROL_PLATFORM_SESSION_COMPANY_ID;
}
