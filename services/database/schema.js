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
    NOTIFICATIONS: "notifications",
    DOCUMENTS: "documents",
    FILES: "files",
    SETTINGS: "settings",
    PROVISIONING: "provisioning",
    MARKETPLACE: "marketplace",
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

/** Platform-level marketplace collections */
export const PLATFORM_MARKETPLACE = {
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
        whatsappNumber: "string",
        whatsappConnected: "boolean",
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
        version: "string",
        installedAt: "timestamp",
        updatedAt: "timestamp",
        customizations: "map",
        enabledIntegrations: "array",
        agentIds: "array",
        knowledgeDocIds: "array",
        workflowIds: "array",
        links: "map",
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

export function tenantMarketplaceInstalledPath(companyId, packId) {
    return `${tenantCollectionPath(companyId, TENANT_COLLECTIONS.MARKETPLACE)}/${TENANT_MARKETPLACE.INSTALLED}/${packId}`;
}

export function platformPackVersionPath(packId, version) {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.PACKS}/${packId}/versions/${version}`;
}

export function platformReviewPath(reviewId) {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.REVIEWS}/${reviewId}`;
}

export function platformRatingPath(packId) {
    return `${ROOT.PLATFORM}/${PLATFORM_MARKETPLACE.RATINGS}/${packId}`;
}
