/**
 * Platform provisioning orchestration — wires company, agent, and inbound
 * message flows into a single interconnected tenant workspace.
 *
 * Works with STORAGE_BACKEND=memory for local dev; adapter methods mirror
 * what Firestore collections will store in production.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import {
    createCompany,
    saveProvisioningLinks,
    getProvisioningLinks as getStoredLinks,
    buildWorkspaceLinks,
} from "../tenants/companyService.js";
import { saveAiEmployee, saveAgentProvisioning } from "../tenants/aiEmployeeService.js";
import { ensureCrmWorkspace } from "../tenants/crmService.js";
import { ensureKnowledgeBase } from "../tenants/knowledgeService.js";
import { seedDefaultDepartments } from "../tenants/departmentService.js";
import { upsertTenantUser } from "../tenants/userService.js";
import { createTrialSubscription } from "../payments/billingService.js";
import { portalUrlForCompany } from "../core/siteUrls.js";
import { listWorkflows as seedAutomationTemplates } from "../automation/workflowRegistry.js";
import { pushActivity, createNotification } from "../tenants/notificationService.js";
import { createWorkflow } from "../workflows/workflowService.js";
import { recordTenantEvent } from "../analytics/tenantAnalyticsService.js";
import { publish, EventTypes } from "../events/index.js";
import { systemPrompt as DEFAULT_SYSTEM_PROMPT } from "../../prompts/systemPrompt.js";
import {
    upsertCustomerFromWhatsApp,
    applyIntelligence,
    addTimelineEvent,
    appendAiSummary,
    updateAiSummary,
    getCustomer,
    addTask,
} from "../customerService.js";
import { analyzeMessage } from "../intelligence/conversationIntelligence.js";
import { storeMemory } from "../memory/aiMemoryService.js";
import {
    bootstrapTenantPlatform,
    emitCompanyCreated,
    emitSubscriptionStarted,
} from "./tenantBootstrap.js";

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
    return new Date().toISOString();
}

function buildDefaultAgentPrompt(companyName, roleLabel = "Customer Support") {
    return `${DEFAULT_SYSTEM_PROMPT.trim()}

You represent ${companyName || "the company"} as a ${roleLabel} AI employee.
Be helpful, accurate, and aligned with the company's tone.
When unsure, offer to connect the customer with a human team member.`;
}

function buildStarterKnowledge(companyId, companyName, industry = "") {
    return [
        {
            companyId,
            title: `${companyName} — Getting Started`,
            type: "manual",
            content: `${companyName} knowledge base. Industry: ${industry || "General"}. Add FAQs, product docs, and policies here.`,
            status: "active",
        },
        {
            companyId,
            title: `${companyName} — Business Hours`,
            type: "faq",
            content: "Business hours: Monday–Friday 08:00–17:00. Closed weekends and public holidays unless configured otherwise.",
            status: "active",
        },
    ];
}

async function adapter() {
    return getStorageAdapter();
}

/**
 * Provision full tenant workspace when a company is created.
 * @returns {{ companyId, links, provisioned, agent, knowledgeBaseId, workflowIds }}
 */
export async function provisionCompany(companyId, companyData = {}) {
    if (!companyId) throw new Error("companyId is required");

    const store = await adapter();
    if (store.getProvisioning) {
        const existing = await store.getProvisioning(companyId);
        if (existing?.links) {
            return {
                companyId,
                links: existing.links,
                provisioned: existing.resources || [],
                agentId: existing.links.agentId,
                knowledgeBaseId: existing.links.knowledgeBaseId,
                workflowIds: existing.links.workflowIds || [],
                alreadyProvisioned: true,
            };
        }
    }

    const name = String(companyData.name || companyId).trim();
    const industry = companyData.industry || "";
    const plan = companyData.plan || "starter";
    const timestamp = now();

    await createCompany(companyId, {
        name,
        industry,
        plan,
        status: companyData.status || "active",
        email: companyData.email || "",
        phone: companyData.phone || "",
        website: companyData.website || "",
        owner: companyData.owner || "",
        ownerEmail: companyData.ownerEmail || "",
        ownerId: companyData.ownerId || companyData.ownerUid || null,
        ownerUid: companyData.ownerUid || companyData.ownerId || null,
        whatsappNumber: companyData.whatsappNumber || "",
        whatsappConnected: Boolean(companyData.whatsappConnected),
        provisionedAt: timestamp,
    });

    await emitCompanyCreated(companyId, {
        name,
        plan,
        ownerEmail: companyData.ownerEmail || "",
    });

    const departments = await seedDefaultDepartments(companyId);
    const salesDept = departments.find((d) => d.slug === "sales") || departments[0];

    if (companyData.ownerUid || companyData.ownerId) {
        const ownerUid = companyData.ownerUid || companyData.ownerId;
        await upsertTenantUser(companyId, ownerUid, {
            email: companyData.ownerEmail || "",
            fullName: companyData.owner || companyData.ownerName || "Owner",
            role: "owner",
            departmentId: salesDept?.id || null,
            status: "active",
        });
    }

    await ensureKnowledgeBase(companyId, `kb-${companyId}`);

    const agentResult = await provisionAgent(companyId, null, {
        name: companyData.agentName || `${name.split(" ")[0] || "Alex"} (AI)`,
        role: "customer_support",
        roleLabel: "Customer Support",
        isDefault: true,
        companyName: name,
        whatsappNumber: companyData.whatsappNumber || "",
        whatsappConnected: Boolean(companyData.whatsappConnected),
    });

    const knowledgeBaseId = `kb-${companyId}`;
    const knowledgeDocs = [];
    if (store.saveKnowledgeDoc) {
        for (const doc of buildStarterKnowledge(companyId, name, industry)) {
            const saved = await store.saveKnowledgeDoc({
                ...doc,
                id: uid("kn"),
                knowledgeBaseId,
                createdAt: timestamp,
                updatedAt: timestamp,
            });
            knowledgeDocs.push(saved);
        }
    }

    await ensureCrmWorkspace(companyId, `${name} CRM`);

    await recordTenantEvent(companyId, "company_provisioned", {
        companyId,
        name,
        agentId: agentResult.agentId,
        knowledgeBaseId,
    });

    if (store.seedAnalytics) {
        await store.seedAnalytics(companyId, {
            messages: 0,
            conversations: 0,
            satisfaction: 97,
            leadScoreAvg: 50,
            provisionedAt: timestamp,
        });
    }

    const billingRecord = await createTrialSubscription(companyId, { planId: plan });
    await emitSubscriptionStarted(companyId, billingRecord);

    const automationTemplates = await seedAutomationTemplates(companyId);

    if (knowledgeDocs.length) {
        await publish(companyId, EventTypes.KNOWLEDGE_UPLOADED, {
            count: knowledgeDocs.length,
            source: "provisioning",
            knowledgeBaseId,
        }).catch(() => {});
    }

    const workflowIds = [];
    const wfResult = await createWorkflow({
        name: `${name} — Inbound WhatsApp`,
        companyId,
        companyName: name,
        createdBy: companyData.owner || "System",
    });
    if (wfResult.id) workflowIds.push(wfResult.id);

    const workspaceLinks = buildWorkspaceLinks(companyId, {
        agentId: agentResult.agentId,
        agentName: agentResult.agent?.name,
        knowledgeBaseId,
        knowledgeDocIds: knowledgeDocs.map((d) => d.id),
        crmWorkspaceId: companyId,
        analyticsScope: companyId,
        workflowIds,
        inboxScope: companyId,
        departmentIds: departments.map((d) => d.id),
    });

    const links = workspaceLinks;

    const provisioning = {
        companyId,
        links,
        workspaceLinks,
        provisionedAt: timestamp,
        resources: [
            "company",
            "departments",
            "owner_user",
            "portal",
            "default_agent",
            "knowledge_base",
            "crm_workspace",
            "analytics",
            "billing",
            "automation_templates",
            "workflow_workspace",
        ],
    };

    await saveProvisioningLinks(companyId, links, provisioning.resources);

    await pushActivity(companyId, {
        actor: "System",
        action: "provisioned tenant workspace",
        target: name,
        icon: "fa-building",
    });

    await createNotification(companyId, {
        id: uid("n"),
        type: "system",
        icon: "fa-building",
        color: "green",
        title: "Workspace ready",
        message: `${name} is provisioned with ${departments.length} departments and a default AI employee.`,
        time: "Just now",
        meta: { workspaceLinks },
    });

    await publish(companyId, EventTypes.COMPANY_PROVISIONED, {
        companyId,
        name,
        plan,
        departmentCount: departments.length,
        agentId: agentResult.agentId,
        knowledgeBaseId,
        automationTemplateCount: automationTemplates.length,
        workspaceLinks,
    }).catch(() => {});

    await bootstrapTenantPlatform(companyId, {
        name,
        industry,
        plan,
        owner: companyData.owner || "",
        ownerEmail: companyData.ownerEmail || "",
        agentId: agentResult.agentId,
        agentName: agentResult.agent?.name,
        knowledgeBaseId,
        provisionedAt: timestamp,
        isNew: true,
    });

    return {
        companyId,
        links,
        workspaceLinks,
        departments,
        provisioned: provisioning.resources,
        agent: agentResult.agent,
        agentId: agentResult.agentId,
        knowledgeBaseId,
        workflowIds,
        automationTemplateCount: automationTemplates.length,
    };
}

/**
 * Provision AI employee resources: prompt, memory, knowledge link, analytics, inbox.
 */
export async function provisionAgent(companyId, agentId = null, agentData = {}) {
    if (!companyId) throw new Error("companyId is required");

    const store = await adapter();
    const id = agentId || uid("agent");

    if (agentId && store.getAgentProvisioning) {
        const existing = await store.getAgentProvisioning(agentId);
        if (existing?.links) {
            const agent = (await store.getAgent?.(agentId)) || { id: agentId, companyId, ...agentData };
            return { agentId, agent, links: existing.links, alreadyProvisioned: true };
        }
    }

    const timestamp = now();
    const companyName = agentData.companyName || companyId;
    const roleLabel = agentData.roleLabel || "Customer Support";
    const prompt = agentData.systemPrompt || buildDefaultAgentPrompt(companyName, roleLabel);

    const agent = {
        id,
        companyId,
        name: String(agentData.name || "AI Employee").trim(),
        role: agentData.role || "customer_support",
        roleLabel,
        avatar: agentData.avatar || "🤖",
        personality: agentData.personality || "professional",
        model: agentData.model || "gpt-4o-mini",
        temperature: Number(agentData.temperature ?? 0.7),
        memory: agentData.memory !== false,
        systemPrompt: prompt,
        greetingMessage:
            agentData.greetingMessage ||
            `Hi! I'm ${agentData.name || "your AI assistant"}. How can I help you today?`,
        whatsappNumber: agentData.whatsappNumber || "",
        whatsappConnected: Boolean(agentData.whatsappConnected),
        knowledgeBaseId: agentData.knowledgeBaseId || `kb-${companyId}`,
        status: agentData.status || "active",
        isDefault: Boolean(agentData.isDefault),
        provisionedAt: timestamp,
        inboxEnabled: true,
    };

    await saveAiEmployee(companyId, id, agent);

    if (store.saveAgentPrompt) {
        await store.saveAgentPrompt(id, { prompt, updatedAt: timestamp });
    }

    if (store.saveMemory && agent.memory) {
        await store.saveMemory(`agent:${id}`, "bootstrap", `Default ${roleLabel} for ${companyName}`);
    }

    if (store.linkAgentKnowledge) {
        await store.linkAgentKnowledge(id, agent.knowledgeBaseId);
    }

    await recordTenantEvent(companyId, "agent_provisioned", {
        agentId: id,
        name: agent.name,
    });

    if (store.seedAnalytics) {
        await store.seedAnalytics(`agent:${id}`, {
            conversations: 0,
            messages: 0,
            satisfaction: 97,
            provisionedAt: timestamp,
        });
    }

    if (store.ensureInboxScope) {
        await store.ensureInboxScope(companyId, id);
    }

    const links = {
        promptId: id,
        memoryKey: `agent:${id}`,
        knowledgeBaseId: agent.knowledgeBaseId,
        analyticsScope: `agent:${id}`,
        inboxScope: companyId,
    };

    await saveAgentProvisioning(companyId, id, { agentId: id, links, provisionedAt: timestamp });

    await pushActivity(companyId, {
        actor: "System",
        action: "provisioned AI employee",
        target: agent.name,
        icon: "fa-robot",
    });

    return { agentId: id, agent, links };
}

export async function getCompanyLinks(companyId) {
    const record = await getStoredLinks(companyId);
    if (record?.links) return record;
    return {
        companyId,
        links: {
            portalUrl: portalUrlForCompany(companyId),
            knowledgeBaseId: `kb-${companyId}`,
            crmWorkspaceId: companyId,
            inboxScope: companyId,
        },
    };
}

export async function getDefaultAgentForCompany(companyId) {
    const { getDefaultAiEmployee } = await import("../tenants/aiEmployeeService.js");
    const tenantDefault = await getDefaultAiEmployee(companyId);
    if (tenantDefault) return tenantDefault;

    const store = await adapter();
    if (!store.listAgents) return null;
    const agents = await store.listAgents({ companyId });
    return agents.find((a) => a.isDefault) || agents[0] || null;
}

function buildConversationSummary(text, analysis) {
    const preview = String(text || "").slice(0, 160);
    return `Customer message about ${analysis.category || analysis.topic || "general"} (${analysis.intent}). Sentiment: ${analysis.sentiment}. ${preview}`;
}

/**
 * Full inbound CRM intelligence chain after WhatsApp message arrives.
 */
export async function processInboundCustomerPipeline(phone, context = {}) {
    const {
        text = "",
        contactName,
        companyId: ctxCompanyId,
        reply = "",
        agentId: ctxAgentId,
    } = context;

    const store = await adapter();
    const companyId =
        ctxCompanyId ||
        process.env.DEFAULT_COMPANY_ID ||
        null;

    await upsertCustomerFromWhatsApp(phone, {
        contactName,
        companyId,
        messagePreview: text.slice(0, 120),
    });

    const customer = (await getCustomer(phone)) || {};
    const resolvedCompanyId = customer.companyId || companyId;
    const agent =
        (ctxAgentId && (await store.getAgent?.(ctxAgentId))) ||
        (resolvedCompanyId ? await getDefaultAgentForCompany(resolvedCompanyId) : null);

    if (agent && !customer.assignedAiEmployee) {
        await store.updateCustomer?.(phone, {
            assignedAiEmployee: agent.name,
            assignedEmployee: customer.assignedEmployee || agent.name,
            companyId: resolvedCompanyId,
        });
    }

    const analysis = analyzeMessage(phone, text, reply);
    await applyIntelligence(phone, analysis);

    const summary = buildConversationSummary(text, analysis);
    await updateAiSummary(phone, summary);

    await addTimelineEvent(phone, {
        type: "whatsapp",
        title: "WhatsApp Message",
        description: String(text).slice(0, 200),
    });

    await appendAiSummary(
        phone,
        `Discussed: ${analysis.category || analysis.topic || "general"} (${analysis.intent}). ${analysis.recommendedAction || ""}`
    );

    if (analysis.recommendedAction) {
        await addTimelineEvent(phone, {
            type: "recommendation",
            title: "Recommended Follow-up",
            description: analysis.recommendedAction,
            meta: { reason: analysis.recommendedReason, confidence: analysis.confidence },
        });
    }

    const facts = [];
    if (/\b(budget|finance|hilux|vehicle|trade.?in)\b/i.test(text)) {
        facts.push(`Inbound interest: ${analysis.topic || "general"}`);
    }
    for (const fact of facts) {
        await storeMemory(phone, agent?.id || "default", fact);
    }

    if (resolvedCompanyId) {
        await recordTenantEvent(resolvedCompanyId, "inbound_message_processed", {
            phone,
            agentId: agent?.id || null,
            sentiment: analysis.sentiment,
            leadQuality: analysis.leadQuality,
        });
    }

    const shouldNotifyStaff =
        analysis.escalationNeeded ||
        analysis.sentiment === "negative" ||
        (analysis.leadQuality ?? 0) >= 80;

    if (shouldNotifyStaff && resolvedCompanyId) {
        await createNotification(resolvedCompanyId, {
            id: uid("n"),
            type: analysis.escalationNeeded ? "escalation" : "customer",
            icon: analysis.escalationNeeded ? "fa-user-shield" : "fa-user-plus",
            color: analysis.escalationNeeded ? "red" : "blue",
            title: analysis.escalationNeeded ? "Escalation needed" : "High-intent customer",
            message: `${contactName || phone}: ${analysis.recommendedAction || text.slice(0, 80)}`,
            time: "Just now",
            meta: { phone, leadQuality: analysis.leadQuality, sentiment: analysis.sentiment },
        });

        if (analysis.escalationNeeded) {
            await addTask(phone, {
                title: analysis.recommendedAction || "Follow up — escalation",
                priority: "high",
                assignedTo: agent?.name || "Team",
            });
        }
    }

    return {
        phone,
        companyId: resolvedCompanyId,
        agentId: agent?.id || null,
        analysis,
        summary,
        notifiedStaff: shouldNotifyStaff,
    };
}

/**
 * Install a curated industry pack from the AI Marketplace.
 * Delegates to industryPackService — provisions agents, KB, workflows, CRM, analytics.
 */
export async function installIndustryPack(companyId, packId) {
    const { installIndustryPack: install } = await import("./industryPackService.js");
    return install(companyId, packId);
}
