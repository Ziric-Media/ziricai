/**
 * Industry pack install orchestration — provisions agents, knowledge, workflows,
 * CRM templates, analytics seed, and reports from marketplace pack definitions.
 */
import { getPackById, getMarketplaceCatalog, resolvePackId } from "./marketplaceRegistry.js";
import { buildPackManifest } from "./marketplaceTemplate.js";
import { getPackDetail, runInstallWizard } from "./marketplaceInstaller.js";
import { checkForUpdates, applyUpdate } from "./marketplaceVersioning.js";
import { provisionAgent, getCompanyLinks } from "./provisioningService.js";
import { saveKnowledgeDocument, ensureKnowledgeBase } from "../tenants/knowledgeService.js";
import { upsertWorkflow } from "../automation/workflowRegistry.js";
import { EventTypes } from "../events/eventTypes.js";
import { recordEvent } from "../analytics/analyticsService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
    return new Date().toISOString();
}

async function adapter() {
    return getStorageAdapter();
}

function parseKeywords(keywordStr) {
    if (!keywordStr) return [];
    return String(keywordStr)
        .split("|")
        .map((k) => k.trim())
        .filter(Boolean);
}

/** Convert marketplace pack node graph → automation engine trigger/actions. */
export function convertPackWorkflowToAutomation(wfDef = {}) {
    const trigger = { eventType: EventTypes.MESSAGE_RECEIVED, match: {} };
    const actions = [];

    for (const node of wfDef.nodes || []) {
        const stepType = node.stepType || node.type;

        if (stepType === "whatsapp_message" || node.type === "trigger") {
            trigger.eventType = EventTypes.MESSAGE_RECEIVED;
        }

        if (stepType === "contains_keyword" || node.type === "condition") {
            const keywords = parseKeywords(node.config?.keyword);
            if (keywords.length) trigger.match.keywords = keywords;
        }

        if (node.type === "action" || String(stepType || "").startsWith("action")) {
            if (stepType === "reply" || node.config?.template) {
                actions.push({
                    type: "send_message",
                    config: { template: node.config?.template || "acknowledgement" },
                });
            }
            if (stepType === "create_task") {
                actions.push({
                    type: "create_task",
                    config: {
                        title: node.config?.title || "Marketplace workflow follow-up",
                        priority: node.config?.priority || "medium",
                    },
                });
            }
            if (stepType === "update_crm") {
                actions.push({
                    type: "update_crm",
                    config: {
                        status: node.config?.stage || node.config?.status,
                        tags: node.config?.tags,
                    },
                });
            }
        }
    }

    if (!actions.length) {
        actions.push({
            type: "send_notification",
            config: { title: `${wfDef.name || "Pack workflow"} triggered` },
        });
    }

    return { trigger, actions };
}

export { getMarketplaceCatalog, getPackDetail, checkForUpdates, applyUpdate, runInstallWizard };

export function getCatalogWithFilters(filters = {}) {
    return getMarketplaceCatalog(filters);
}

export async function getInstalledPacks(companyId) {
    if (!companyId) return { items: [] };
    const store = await adapter();
    if (store.getInstalledPacks) {
        const items = await store.getInstalledPacks(companyId);
        return { items: items || [] };
    }
    return { items: [] };
}

export async function isPackInstalled(companyId, packId) {
    const resolved = resolvePackId(packId);
    const store = await adapter();
    if (store.isPackInstalled) {
        if (await store.isPackInstalled(companyId, resolved)) return true;
        if (resolved !== packId && (await store.isPackInstalled(companyId, packId))) return true;
    }
    const { items } = await getInstalledPacks(companyId);
    return items.some((p) => p.packId === resolved || p.packId === packId);
}

/**
 * Install an industry pack for a tenant — instant provisioning of all bundled resources.
 * @returns {Promise<object>} Install result with cross-links for admin UI navigation
 */
export async function installIndustryPack(companyId, packId, customizations = {}) {
    if (!companyId) throw new Error("companyId is required");
    if (!packId) throw new Error("packId is required");

    const resolvedId = resolvePackId(packId);
    const pack = getPackById(resolvedId);
    if (!pack) throw new Error(`Pack not found: ${packId}`);
    if (pack.installable === false) throw new Error(`Pack "${pack.name}" is not yet available for install`);

    if (await isPackInstalled(companyId, resolvedId)) {
        const existing = (await getInstalledPacks(companyId)).items.find(
            (p) => p.packId === resolvedId || p.packId === packId
        );
        return {
            companyId,
            packId: resolvedId,
            packName: pack.name,
            alreadyInstalled: true,
            installedAt: existing?.installedAt,
            links: existing?.links || {},
            customizations: existing?.customizations || {},
        };
    }

    const store = await adapter();
    const timestamp = now();
    const company =
        (store.getPortalCompany && (await store.getPortalCompany(companyId))) ||
        { id: companyId, name: companyId };
    const companyName = company.name || companyId;
    const knowledgeBaseId = `kb-${companyId}`;
    const branding = customizations.branding || {};

    const agentIds = [];
    const agentNames = [];
    for (const agentDef of pack.agents || []) {
        const customizedAgent = {
            ...agentDef,
            companyName,
            knowledgeBaseId,
            isDefault: agentIds.length === 0,
        };
        if (branding.agentName) customizedAgent.name = branding.agentName;
        if (branding.greetingMessage) customizedAgent.greetingMessage = branding.greetingMessage;
        if (branding.systemPrompt) customizedAgent.systemPrompt = branding.systemPrompt;

        const result = await provisionAgent(companyId, null, customizedAgent);
        agentIds.push(result.agentId);
        agentNames.push(result.agent?.name || agentDef.name);
    }

    await ensureKnowledgeBase(companyId, knowledgeBaseId);

    const knowledgeDocIds = [];
    for (const doc of pack.knowledge || []) {
        const saved = await saveKnowledgeDocument({
            ...doc,
            companyId,
            knowledgeBaseId,
            type: doc.type || "manual",
            source: `pack:${resolvedId}`,
        }).catch(async () => {
            if (!store.saveKnowledgeDoc) return null;
            return store.saveKnowledgeDoc({
                ...doc,
                id: uid("kn"),
                companyId,
                knowledgeBaseId,
                status: doc.status || "active",
                createdAt: timestamp,
                updatedAt: timestamp,
                source: `pack:${packId}`,
            });
        });
        if (saved?.id) knowledgeDocIds.push(saved.id);
    }

    const workflowIds = [];
    for (const wfDef of pack.workflows || []) {
        const { trigger, actions } = convertPackWorkflowToAutomation(wfDef);
        const wfSlug = String(wfDef.name || "workflow")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 40);
        const saved = await upsertWorkflow(companyId, null, {
            name: `${pack.name.split(" ")[0]} — ${wfDef.name}`,
            companyId,
            companyName,
            status: "active",
            source: `pack:${resolvedId}`,
            packId: resolvedId,
            trigger,
            actions,
            nodes: wfDef.nodes,
            createdBy: "Marketplace",
        });
        if (saved?.id) workflowIds.push(saved.id);
    }

    if (pack.crmTemplates && store.saveCrmTemplates) {
        await store.saveCrmTemplates(companyId, {
            ...pack.crmTemplates,
            packId,
            installedAt: timestamp,
        });
    } else if (pack.crmTemplates && store.saveCrmWorkspace) {
        const existing = (await store.getCrmWorkspace?.(companyId)) || { companyId };
        await store.saveCrmWorkspace(companyId, {
            ...existing,
            ...pack.crmTemplates,
            packId,
            updatedAt: timestamp,
        });
    }

    if (pack.analytics && store.seedAnalytics) {
        await store.seedAnalytics(companyId, {
            ...pack.analytics,
            packId,
            seededFrom: packId,
            provisionedAt: timestamp,
        });
    }

    const reportIds = [];
    if (pack.reports?.length && store.saveReportTemplates) {
        const saved = await store.saveReportTemplates(companyId, pack.reports.map((r) => ({
            ...r,
            id: r.id || uid("rpt"),
            packId,
            createdAt: timestamp,
        })));
        reportIds.push(...(saved?.map((r) => r.id) || pack.reports.map((r) => r.id)));
    }

    const links = {
        agents: agentIds,
        agentNames,
        knowledgeBaseId,
        knowledgeDocIds,
        workflowIds,
        crmWorkspaceId: companyId,
        analyticsScope: companyId,
        reportIds,
        navigate: {
            agents: "agents",
            knowledge: "knowledge",
            automation: "automation",
            customers: "customers",
            analytics: "analytics",
        },
    };

    const manifest = buildPackManifest(pack);
    const installRecord = {
        id: uid("install"),
        packId: resolvedId,
        packName: manifest.name || pack.name,
        category: pack.category,
        version: pack.version,
        companyId,
        installedAt: timestamp,
        agentIds,
        knowledgeDocIds,
        workflowIds,
        reportIds,
        customizations: {
            branding: branding || {},
            enabledIntegrations: customizations.enabledIntegrations || manifest.suggestedIntegrations,
            disabledIntegrations: customizations.disabledIntegrations || [],
        },
        mergedKnowledgeTitles: (pack.knowledge || []).map((k) => k.title),
        mergedWorkflowNames: (pack.workflows || []).map((w) => w.name),
        links,
    };

    if (store.saveInstalledPack) {
        await store.saveInstalledPack(companyId, installRecord);
    }

    const companyLinks = await getCompanyLinks(companyId);
    if (store.saveProvisioning && companyLinks?.links) {
        const mergedLinks = {
            ...companyLinks.links,
            installedPackIds: [...(companyLinks.links.installedPackIds || []), resolvedId],
            lastPackInstall: { packId: resolvedId, at: timestamp },
        };
        await store.saveProvisioning(companyId, {
            companyId,
            links: mergedLinks,
            updatedAt: timestamp,
        });
    }

    if (store.pushPortalActivity) {
        await store.pushPortalActivity(companyId, {
            actor: "Marketplace",
            action: `installed ${pack.name}`,
            target: companyName,
            icon: "fa-store",
        });
    }

    await recordEvent("industry_pack_installed", {
        companyId,
        packId: resolvedId,
        packName: pack.name,
        agentCount: agentIds.length,
        workflowCount: workflowIds.length,
        knowledgeCount: knowledgeDocIds.length,
    });

    return {
        success: true,
        companyId,
        packId: resolvedId,
        packName: manifest.name || pack.name,
        installedAt: timestamp,
        customizations: installRecord.customizations,
        provisioned: {
            agents: agentIds.length,
            knowledgeDocs: knowledgeDocIds.length,
            workflows: workflowIds.length,
            reports: reportIds.length,
        },
        links,
        message: `${manifest.name || pack.name} installed successfully for ${companyName}.`,
    };
}
