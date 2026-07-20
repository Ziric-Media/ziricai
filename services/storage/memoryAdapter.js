/**
 * In-memory storage adapter — TEMP fallback when Firestore billing is blocked.
 * Data is lost on server restart. Swap STORAGE_BACKEND=firestore for persistence.
 */

const customers = new Map();
const messages = new Map();
const memories = new Map();
const portalCompanies = new Map();
const portalNotifications = new Map();
const portalActivity = new Map();
const agents = new Map();
const agentPrompts = new Map();
const agentProvisioning = new Map();
const knowledgeDocs = new Map();
const provisioning = new Map();
const crmWorkspaces = new Map();
const analyticsScopes = new Map();
const inboxScopes = new Map();
const agentKnowledgeLinks = new Map();
const installedPacks = new Map();
const packVersions = new Map();
const marketplaceReviews = new Map();
const packRatings = new Map();
const supervisorReviews = new Map();
const crmTemplateStore = new Map();
const reportTemplateStore = new Map();
const analyticsRollups = new Map();

function now() {
    return new Date().toISOString();
}

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function msgKey(customerId, agentId) {
    return `${customerId}::${agentId || "default"}`;
}

export const memoryAdapter = {
    name: "memory",

    async ping() {
        return true;
    },

    async saveMessage(phone, role, message, options = {}) {
        if (!messages.has(phone)) messages.set(phone, []);
        messages.get(phone).push({
            role,
            message,
            createdAt: now(),
        });

        const existing = customers.get(phone) || {};
        const patch = {
            phone,
            lastMessage: message,
            lastSeen: now(),
            status: "in_progress",
            mode: "ai",
            channel: "whatsapp",
            totalMessages: (existing.totalMessages || 0) + 1,
        };
        if (options.name) patch.name = options.name;
        customers.set(phone, { ...existing, ...patch });
        return { phone, role };
    },

    async getConversation(phone, max = 20) {
        const list = messages.get(phone) || [];
        return list.slice(-max).map((m) => ({
            role: m.role,
            content: m.message,
        }));
    },

    async listConversations({ companyId = null, limit: max = 50 } = {}) {
        let items = [...customers.values()].map((c) => ({
            id: c.phone,
            phone: c.phone,
            name: c.name || c.phone,
            customerName: c.name || c.phone,
            companyId: c.companyId || null,
            lastMessage: c.lastMessage || "",
            preview: c.lastMessage || "",
            status: c.status || "in_progress",
            mode: c.mode || "ai",
            channel: c.channel || "whatsapp",
            time: c.lastSeen || null,
            leadScore: c.leadScore ?? null,
            tags: c.tags || [],
        }));
        if (companyId) items = items.filter((c) => c.companyId === companyId);
        items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
        return items.slice(0, max);
    },

    async upsertCustomer(phone, patch = {}) {
        const existing = customers.get(phone) || { phone };
        const merged = { ...existing, ...patch, phone, updatedAt: now() };
        if (!merged.createdAt) merged.createdAt = now();
        customers.set(phone, merged);
        return merged;
    },

    async getCustomer(phone) {
        return customers.get(phone) || null;
    },

    async listCustomers({ companyId = null, limit: max = 100 } = {}) {
        let items = [...customers.values()].map((c) => ({
            id: c.id || c.phone,
            phone: c.phone,
            name: c.name || c.phone,
            email: c.email || "",
            companyId: c.companyId || null,
            companyName: c.companyName || null,
            leadScore: c.leadScore ?? null,
            averageSentiment: c.averageSentiment ?? null,
            sentimentLabel: c.sentimentLabel || c.averageSentiment || null,
            lastSeen: c.lastSeen || null,
            tags: c.tags || [],
            status: c.status || "in_progress",
            online: c.online ?? false,
            assignedAiEmployee: c.assignedAiEmployee || null,
            lastMessage: c.lastMessage || "",
        }));
        if (companyId) items = items.filter((c) => c.companyId === companyId);
        items.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
        return items.slice(0, max);
    },

    async updateCustomer(phone, patch = {}) {
        return memoryAdapter.upsertCustomer(phone, patch);
    },

    async saveMemory(customerId, agentId, fact) {
        const key = msgKey(customerId, agentId);
        if (!memories.has(key)) memories.set(key, []);
        const entry = { fact, createdAt: now(), agentId: agentId || "default" };
        memories.get(key).push(entry);
        return entry;
    },

    async getMemories(customerId, agentId) {
        return memories.get(msgKey(customerId, agentId)) || [];
    },

    async saveConversationAnalysis(phone, analysis) {
        const existing = customers.get(phone) || { phone };
        customers.set(phone, {
            ...existing,
            lastAnalysis: analysis,
            averageSentiment: analysis.sentiment ?? existing.averageSentiment,
            updatedAt: now(),
        });
        return analysis;
    },

    /* ── Platform provisioning stores ── */

    async savePortalCompany(companyId, record) {
        portalCompanies.set(companyId, { ...record, id: companyId, updatedAt: now() });
        return portalCompanies.get(companyId);
    },

    async getPortalCompany(companyId) {
        return portalCompanies.get(companyId) || null;
    },

    async pushPortalNotification(companyId, notification) {
        if (!portalNotifications.has(companyId)) portalNotifications.set(companyId, []);
        const entry = { id: notification.id || uid("n"), ...notification, companyId };
        portalNotifications.get(companyId).unshift(entry);
        return entry;
    },

    async getPortalNotifications(companyId) {
        return portalNotifications.get(companyId) || [];
    },

    async pushPortalActivity(companyId, activity) {
        if (!portalActivity.has(companyId)) portalActivity.set(companyId, []);
        const entry = {
            id: uid("a"),
            time: now(),
            ago: "Just now",
            ...activity,
        };
        portalActivity.get(companyId).unshift(entry);
        return entry;
    },

    async getPortalActivity(companyId) {
        return portalActivity.get(companyId) || [];
    },

    async saveAgent(agentId, agent) {
        agents.set(agentId, { ...agent, id: agentId, updatedAt: now() });
        return agents.get(agentId);
    },

    async getAgent(agentId) {
        return agents.get(agentId) || null;
    },

    async listAgents({ companyId = null } = {}) {
        let items = [...agents.values()];
        if (companyId) items = items.filter((a) => a.companyId === companyId);
        return items;
    },

    async saveAgentPrompt(agentId, data) {
        agentPrompts.set(agentId, { ...data, agentId, updatedAt: now() });
        return agentPrompts.get(agentId);
    },

    async saveAgentProvisioning(agentId, record) {
        agentProvisioning.set(agentId, record);
        return record;
    },

    async getAgentProvisioning(agentId) {
        return agentProvisioning.get(agentId) || null;
    },

    async saveKnowledgeDoc(doc) {
        const id = doc.id || uid("kn");
        const saved = { ...doc, id, updatedAt: now(), createdAt: doc.createdAt || now() };
        knowledgeDocs.set(id, saved);
        return saved;
    },

    async listKnowledgeDocs({ companyId = null, knowledgeBaseId = null } = {}) {
        let items = [...knowledgeDocs.values()];
        if (companyId) items = items.filter((d) => d.companyId === companyId);
        if (knowledgeBaseId) items = items.filter((d) => d.knowledgeBaseId === knowledgeBaseId);
        items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        return items;
    },

    async saveProvisioning(companyId, record) {
        provisioning.set(companyId, { ...record, updatedAt: now() });
        return provisioning.get(companyId);
    },

    async getProvisioning(companyId) {
        return provisioning.get(companyId) || null;
    },

    async saveCrmWorkspace(companyId, workspace) {
        crmWorkspaces.set(companyId, { ...workspace, updatedAt: now() });
        return crmWorkspaces.get(companyId);
    },

    async getCrmWorkspace(companyId) {
        return crmWorkspaces.get(companyId) || null;
    },

    async seedAnalytics(scopeId, data) {
        analyticsScopes.set(scopeId, { ...data, scopeId, updatedAt: now() });
        return analyticsScopes.get(scopeId);
    },

    async getAnalytics(scopeId) {
        return analyticsScopes.get(scopeId) || null;
    },

    async ensureInboxScope(companyId, agentId) {
        inboxScopes.set(companyId, { companyId, agentId, updatedAt: now() });
        return inboxScopes.get(companyId);
    },

    async linkAgentKnowledge(agentId, knowledgeBaseId) {
        agentKnowledgeLinks.set(agentId, { agentId, knowledgeBaseId, updatedAt: now() });
        return agentKnowledgeLinks.get(agentId);
    },

    /* ── Marketplace & AI Supervisor stores ── */

    async saveInstalledPack(companyId, record) {
        if (!installedPacks.has(companyId)) installedPacks.set(companyId, []);
        const list = installedPacks.get(companyId);
        if (record._replace && record._originalPackId) {
            const idx = list.findIndex((p) => p.packId === record._originalPackId);
            const entry = { ...record, companyId };
            delete entry._replace;
            delete entry._originalPackId;
            if (idx >= 0) list[idx] = entry;
            else list.push(entry);
            return entry;
        }
        const entry = { ...record, companyId };
        list.push(entry);
        return entry;
    },

    async updateInstalledPack(companyId, packId, patch) {
        const list = installedPacks.get(companyId) || [];
        const idx = list.findIndex((p) => p.packId === packId);
        if (idx < 0) return null;
        list[idx] = { ...list[idx], ...patch, updatedAt: now() };
        return list[idx];
    },

    async getInstalledPack(companyId, packId) {
        const list = installedPacks.get(companyId) || [];
        return list.find((p) => p.packId === packId) || null;
    },

    async getInstalledPacks(companyId) {
        return installedPacks.get(companyId) || [];
    },

    async isPackInstalled(companyId, packId) {
        const list = installedPacks.get(companyId) || [];
        return list.some((p) => p.packId === packId);
    },

    /* ── Platform marketplace stores ── */

    async savePackVersion(packId, version, template) {
        const key = `${packId}@${version}`;
        const entry = { packId, version, template, publishedAt: now(), changelog: template.changelog || [] };
        packVersions.set(key, entry);
        return entry;
    },

    async getPackVersion(packId, version) {
        return packVersions.get(`${packId}@${version}`) || null;
    },

    async listPackVersions(packId) {
        return [...packVersions.values()].filter((v) => v.packId === packId);
    },

    async saveMarketplaceReview(packId, review) {
        if (!marketplaceReviews.has(packId)) marketplaceReviews.set(packId, []);
        marketplaceReviews.get(packId).unshift(review);
        return review;
    },

    async listMarketplaceReviews(packId, limit = 20) {
        const list = marketplaceReviews.get(packId) || [];
        return list.slice(0, limit);
    },

    async getPackRating(packId) {
        return packRatings.get(packId) || { packId, average: 0, count: 0 };
    },

    async updatePackRating(packId, newRating) {
        const existing = packRatings.get(packId) || { packId, average: 0, count: 0 };
        const count = existing.count + 1;
        const average = ((existing.average * existing.count) + newRating) / count;
        const updated = { packId, average: Math.round(average * 10) / 10, count, updatedAt: now() };
        packRatings.set(packId, updated);
        return updated;
    },

    async saveSupervisorReview(companyId, review) {
        if (!supervisorReviews.has(companyId)) supervisorReviews.set(companyId, []);
        const entry = { ...review, companyId };
        supervisorReviews.get(companyId).unshift(entry);
        if (supervisorReviews.get(companyId).length > 200) {
            supervisorReviews.set(companyId, supervisorReviews.get(companyId).slice(0, 200));
        }
        return entry;
    },

    async listSupervisorReviews(companyId, limit = 20) {
        const list = supervisorReviews.get(companyId) || [];
        return list.slice(0, limit);
    },

    async saveCrmTemplates(companyId, templates) {
        crmTemplateStore.set(companyId, { ...templates, companyId, updatedAt: now() });
        return crmTemplateStore.get(companyId);
    },

    async getCrmTemplates(companyId) {
        return crmTemplateStore.get(companyId) || null;
    },

    async saveReportTemplates(companyId, templates) {
        const saved = (templates || []).map((t) => ({ ...t, companyId, updatedAt: now() }));
        reportTemplateStore.set(companyId, saved);
        return saved;
    },

    async getReportTemplates(companyId) {
        return reportTemplateStore.get(companyId) || [];
    },

    async saveAnalyticsRollup(companyId, rollup) {
        analyticsRollups.set(companyId, { ...rollup, companyId, updatedAt: now() });
        return analyticsRollups.get(companyId);
    },

    async getAnalyticsRollup(companyId) {
        return analyticsRollups.get(companyId) || null;
    },
};
