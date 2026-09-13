/**
 * Firestore multi-tenant schema constants.
 * All tenant data lives under companies/{companyId}/<subcollection>.
 */

export const ROOT = {
    COMPANIES: "companies",
    USERS: "users",
    PLATFORM: "platform",
};

/** Subcollections under companies/{companyId} */
export const TENANT_COLLECTIONS = {
    USERS: "users",
    ROLES: "roles",
    DEPARTMENTS: "departments",
    AI_EMPLOYEES: "aiEmployees",
    KNOWLEDGE_BASES: "knowledgeBases",
    CONVERSATIONS: "conversations",
    CONTACTS: "contacts",
    LEADS: "leads",
    CUSTOMERS: "customers",
    APPOINTMENTS: "appointments",
    TASKS: "tasks",
    AUTOMATIONS: "automations",
    ANALYTICS: "analytics",
    EVENTS: "events",
    AUTOMATION_RUNS: "automationRuns",
    BILLING: "billing",
    SUBSCRIPTIONS: "subscriptions",
    INTEGRATIONS: "integrations",
    MESSAGES: "messages",
    MEMORIES: "memories",
    NOTIFICATIONS: "notifications",
    DOCUMENTS: "documents",
    FILES: "files",
    SETTINGS: "settings",
    PROVISIONING: "provisioning",
    MARKETPLACE: "marketplace",
    /** Tenant Industry Pack installation registry (metadata + references). */
    MARKETPLACE_INSTALLS: "marketplaceInstalls",
};

/** Subcollections under companies/{companyId}/analytics (flat names for TenantRepository) */
export const ANALYTICS_SUBCOLLECTIONS = {
    /** Maps to analytics/daily/{date} */
    DAILY: "analyticsDaily",
    /** Maps to analytics/hourly/{hour} */
    HOURLY: "analyticsHourly",
    /** Maps to analytics/metrics/{docId} */
    METRICS: "analyticsMetrics",
};

/** Subcollections under companies/{companyId}/marketplace */
export const TENANT_MARKETPLACE = {
    INSTALLED: "installed",
};

/** Platform-level marketplace collections (under platform/marketplace/…) */
export const PLATFORM_MARKETPLACE = {
    ROOT: "marketplace",
    PACKS: "packs",
    REVIEWS: "reviews",
    RATINGS: "ratings",
};

/** Legacy root-level collections (Phase 1 migration — superadmin / server only) */
export const LEGACY_COLLECTIONS = {
    CUSTOMERS: "customers",
    AGENTS: "agents",
    KNOWLEDGE: "knowledge",
    CONVERSATIONS: "conversations",
    /** @deprecated B-MC-4e — Mission Control reads tenant operations APIs, not root analytics/. */
    ANALYTICS: "analytics",
    BILLING: "billing",
    MEMORIES: "memories",
};

export const PLATFORM_ROLES = {
    SUPERADMIN: "superadmin",
    COMPANY_ADMIN: "company_admin",
    MANAGER: "manager",
    AGENT: "agent",
    VIEWER: "viewer",
};

export const COMPANY_STATUS = {
    ACTIVE: "active",
    TRIAL: "trial",
    SUSPENDED: "suspended",
    ARCHIVED: "archived",
};

/**
 * Field definitions for documentation and validation helpers.
 * @type {Record<string, Record<string, string>>}
 */
export const FIELD_SCHEMA = {
    company: {
        id: "string",
        name: "string",
        industry: "string",
        plan: "string",
        status: "string",
        email: "string",
        phone: "string",
        website: "string",
        ownerUid: "string",
        ownerEmail: "string",
        /** @deprecated B-MC-5c-2d — use companies/{id}/integrations/whatsapp */
        whatsappNumber: "string",
        /** @deprecated B-MC-5c-2d — derived from integration.status in API responses */
        whatsappConnected: "boolean",
        /** @deprecated B-MC-5c-2d — use integration.businessAccountId */
        whatsappBusinessId: "string",
        /** @deprecated B-MC-5c-2d — webhook is global /webhook */
        whatsappWebhookUrl: "string",
        branding: "map",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        provisionedAt: "timestamp",
    },
    tenantUser: {
        uid: "string",
        email: "string",
        fullName: "string",
        role: "string",
        departmentId: "string|null",
        status: "string",
        companyId: "string",
        createdAt: "timestamp",
        lastLogin: "timestamp",
    },
    customer: {
        phone: "string",
        name: "string",
        email: "string",
        companyId: "string",
        status: "string",
        leadScore: "number",
        tags: "array",
        channel: "string",
        assignedAiEmployee: "string|null",
        lastSeen: "timestamp",
        createdAt: "timestamp",
        updatedAt: "timestamp",
    },
    aiEmployee: {
        name: "string",
        role: "string",
        roleLabel: "string",
        model: "string",
        systemPrompt: "string",
        knowledgeBaseId: "string",
        status: "string",
        isDefault: "boolean",
        companyId: "string",
    },
    installedPack: {
        packId: "string",
        packName: "string",
        category: "string",
        companyId: "string",
        version: "string",
        status: "string",
        installedAt: "timestamp",
        updatedAt: "timestamp",
        installedBy: "string",
        installAttemptId: "string",
        customizations: "map",
        enabledIntegrations: "array",
        disabledIntegrations: "array",
        agentIds: "array",
        knowledgeDocIds: "array",
        workflowIds: "array",
        reportIds: "array",
        mergedKnowledgeTitles: "array",
        mergedWorkflowNames: "array",
        links: "map",
        lastError: "string|null",
        failedAt: "timestamp|null",
        installedCompletedAt: "timestamp|null",
    },
    integration: {
        id: "string",
        companyId: "string",
        channel: "string",
        provider: "string",
        phoneNumberId: "string",
        businessAccountId: "string|null",
        displayPhoneNumber: "string|null",
        status: "string",
        credentialsSource: "string|null",
        createdAt: "timestamp",
        updatedAt: "timestamp",
    },
    packVersion: {
        packId: "string",
        version: "string",
        template: "map",
        changelog: "array",
        publishedAt: "timestamp",
    },
    packReview: {
        packId: "string",
        companyId: "string",
        author: "string",
        rating: "number",
        title: "string",
        body: "string",
        createdAt: "timestamp",
    },
    packRating: {
        packId: "string",
        average: "number",
        count: "number",
        updatedAt: "timestamp",
    },
    conversation: {
        customerId: "string",
        channel: "string",
        status: "string",
        lastMessage: "string",
        assignedAgentId: "string|null",
        companyId: "string",
        updatedAt: "timestamp",
    },
    event: {
        id: "string",
        companyId: "string",
        type: "string",
        timestamp: "timestamp",
        actorId: "string|null",
        payload: "map",
        metadata: "map",
        expiresAt: "timestamp",
    },
    analyticsDaily: {
        date: "string",
        conversations: "number",
        leads: "number",
        appointments: "number",
        revenue: "number",
        updatedAt: "timestamp",
    },
    automationWorkflow: {
        id: "string",
        companyId: "string",
        name: "string",
        status: "string",
        trigger: "map",
        actions: "array",
        runs: "number",
        successCount: "number",
        updatedAt: "timestamp",
    },
    automationRun: {
        id: "string",
        workflowId: "string",
        eventType: "string",
        success: "boolean",
        startedAt: "timestamp",
        completedAt: "timestamp",
    },
};

/** Composite indexes required for common tenant queries (see firestore.indexes.json) */
export const INDEX_DEFINITIONS = [
    {
        collectionGroup: "customers",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "lastSeen", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "customers",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "lastSeen", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "conversations",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "updatedAt", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "tasks",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "dueAt", order: "ASCENDING" },
        ],
    },
    {
        collectionGroup: "notifications",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "read", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "leads",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "leadScore", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "aiEmployees",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "isDefault", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "events",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "timestamp", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "events",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "type", order: "ASCENDING" },
            { fieldPath: "timestamp", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "automationRuns",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "startedAt", order: "DESCENDING" },
        ],
    },
    {
        collectionGroup: "appointments",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "scheduledAt", order: "ASCENDING" },
        ],
    },
    {
        collectionGroup: "documents",
        fields: [
            { fieldPath: "companyId", order: "ASCENDING" },
            { fieldPath: "knowledgeBaseId", order: "ASCENDING" },
            { fieldPath: "updatedAt", order: "DESCENDING" },
        ],
    },
];

export function companyPath(companyId) {
    return `${ROOT.COMPANIES}/${companyId}`;
}

export function tenantCollectionPath(companyId, collection) {
    return `${companyPath(companyId)}/${collection}`;
}

/** @deprecated Use tenantMarketplaceInstallPath — legacy path did not match Firestore rules. */
export function tenantMarketplaceInstalledPath(companyId, packId) {
    return tenantMarketplaceInstallPath(companyId, packId);
}

export function tenantMarketplaceInstallPath(companyId, packId) {
    return `${tenantCollectionPath(companyId, TENANT_COLLECTIONS.MARKETPLACE_INSTALLS)}/${packId}`;
}

/** Collection path: platform/marketplace/packs/{packId}/versions */
export function platformPackVersionCollectionPath(packId) {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.ROOT}/${PLATFORM_MARKETPLACE.PACKS}/${packId}/versions`;
}

/** Document path: platform/marketplace/packs/{packId}/versions/{version} */
export function platformPackVersionPath(packId, version) {
    return `${platformPackVersionCollectionPath(packId)}/${version}`;
}

/** Collection path: platform/marketplace/reviews */
export function platformMarketplaceReviewsCollectionPath() {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.ROOT}/${PLATFORM_MARKETPLACE.REVIEWS}`;
}

/** Document path: platform/marketplace/reviews/{reviewId} */
export function platformReviewPath(reviewId) {
    return `${platformMarketplaceReviewsCollectionPath()}/${reviewId}`;
}

/** Document path: platform/marketplace/ratings/{packId} */
export function platformRatingPath(packId) {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.ROOT}/${PLATFORM_MARKETPLACE.RATINGS}/${packId}`;
}
