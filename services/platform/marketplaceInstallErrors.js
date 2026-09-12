/**
 * Marketplace install registry errors and safe error text for lastError.
 */

export const INSTALL_IN_PROGRESS = "INSTALL_IN_PROGRESS";
export const INSTALL_CLAIM_FAILED = "INSTALL_CLAIM_FAILED";
export const INSTALL_ATTEMPT_MISMATCH = "INSTALL_ATTEMPT_MISMATCH";
export const INSTALL_REGISTRY_UNAVAILABLE = "INSTALL_REGISTRY_UNAVAILABLE";

export class MarketplaceInstallError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "MarketplaceInstallError";
        this.code = code;
        this.details = details;
    }
}

const SECRET_PATTERNS = [
    /Bearer\s+\S+/gi,
    /authorization\s*[:=]\s*\S+/gi,
    /private[_-]?key\s*[:=]\s*\S+/gi,
    /api[_-]?key\s*[:=]\s*\S+/gi,
    /password\s*[:=]\s*\S+/gi,
    /token\s*[:=]\s*\S+/gi,
];

export function sanitizeInstallErrorMessage(err) {
    const raw =
        err?.message ||
        (typeof err === "string" ? err : "Installation failed");
    let msg = String(raw).slice(0, 2000);
    for (const pattern of SECRET_PATTERNS) {
        msg = msg.replace(pattern, "[redacted]");
    }
    return msg.trim() || "Installation failed";
}

export function slimRegistryLinks(links = {}) {
    if (!links || typeof links !== "object") return {};
    const {
        agents,
        agentNames,
        knowledgeBaseId,
        knowledgeDocIds,
        workflowIds,
        reportIds,
        crmWorkspaceId,
        analyticsScope,
        navigate,
    } = links;
    return {
        ...(Array.isArray(agents) ? { agents } : {}),
        ...(Array.isArray(agentNames) ? { agentNames } : {}),
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
        ...(Array.isArray(knowledgeDocIds) ? { knowledgeDocIds } : {}),
        ...(Array.isArray(workflowIds) ? { workflowIds } : {}),
        ...(Array.isArray(reportIds) ? { reportIds } : {}),
        ...(crmWorkspaceId ? { crmWorkspaceId } : {}),
        ...(analyticsScope ? { analyticsScope } : {}),
        ...(navigate && typeof navigate === "object" ? { navigate } : {}),
    };
}
