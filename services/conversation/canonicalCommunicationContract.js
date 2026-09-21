/**
 * CORPORATE-P0-3A — Canonical communication authority (architecture lock).
 *
 * This module documents the single authoritative communication write surface per tenant.
 * It is NOT a runtime communication service; verifiers and reviews import these constants.
 *
 * @see docs/deployment/CORPORATE-P0-3-GATE.md
 */

/** Firestore path pattern: companies/{companyId}/messages, companies/{companyId}/conversations */
export const CANONICAL_MESSAGE_STORE = {
    root: "companies",
    conversationsSubcollection: "conversations",
    messagesSubcollection: "messages",
    customersSubcollection: "customers",
};

/**
 * Server-side functions that may persist authoritative conversation/message state.
 * New writers must be registered here before merge.
 */
export const CANONICAL_WRITE_ENTRY_POINTS = [
    "services/conversationService.js:saveInboundMessage",
    "services/conversationService.js:saveOutboundMessage",
    "services/tenants/conversationService.js:sendConversationReply",
    "services/tenants/conversationService.js:setHumanTakeover",
    "services/tenants/conversationService.js:markConversationRead",
    "services/storage/tenantStorage.js:saveTenantMessage",
];

/**
 * Registered channel adapters — must call canonical write entry points.
 */
export const REGISTERED_COMMUNICATION_ADAPTERS = [
    {
        id: "whatsapp-inbound",
        module: "services/integrations/conversationPipeline.js",
        method: "ingest",
        direction: "inbound",
    },
    {
        id: "whatsapp-ai-outbound",
        module: "services/queue/workers/messageWorker.js",
        method: "processInboundMessage",
        direction: "outbound",
    },
    {
        id: "portal-mc-http-mutations",
        module: "services/api/customerOpsRoutes.js",
        routes: [
            "POST /api/companies/:companyId/conversations/:conversationId/reply",
            "POST /api/companies/:companyId/conversations/:conversationId/takeover",
            "POST /api/companies/:companyId/conversations/:conversationId/read",
        ],
        direction: "mutation",
    },
    {
        id: "automation-send-message",
        module: "services/automation/actionExecutor.js",
        method: "executeAction",
        action: "send_message",
        direction: "outbound",
        requires: ["saveOutboundMessage", "getConversationTakeoverState", "integrationHub.sendMessage"],
    },
];

/** Client or server patterns that must not become an authoritative message store (P0-3B removes MC usage). */
export const FORBIDDEN_CLIENT_WRITE_PATTERNS = [
    {
        id: "mc-root-conversation-messages",
        description: "Mission Control writing root conversations/{id}/messages",
        glob: "admin/js/admin/services/conversations.js",
        patterns: [
            /addDoc\s*\(\s*collection\s*\(\s*getDb\s*\(\s*\)\s*,\s*COLLECTION\s*,\s*conversationId\s*,\s*['"]messages['"]\s*\)/,
        ],
    },
    {
        id: "mc-root-takeover",
        description: "Mission Control writing takeover on root conversations doc",
        glob: "admin/js/admin/services/conversations.js",
        patterns: [/updateDocument\s*\(\s*COLLECTION\s*,\s*conversationId\s*,\s*\{[\s\S]*mode/],
    },
];

/** Known debt tracked until P0-3B closes MC competing writes. */
export const KNOWN_COMMUNICATION_DEBT = [
    {
        subGate: "P0-3B",
        id: "mc-admin-inbox-root-writes",
        summary: "admin/js/admin/services/conversations.js must use tenant HTTP APIs for reply/takeover/read",
    },
];

export const ARCHITECTURAL_RULE =
    "No communication feature may introduce a new message/conversation persistence path without registering it as an approved adapter to the canonical communication pipeline.";
