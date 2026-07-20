/**
 * AI Employee service — tenant-scoped agents with legacy adapter dual-write.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { buildEmployeeSystemPrompt, resolveRoleTemplate } from "../ai-core/employeePrompts.js";
import { ensureKnowledgeBase } from "./knowledgeService.js";

class AiEmployeeService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.AI_EMPLOYEES);
    }

    async getDefault(companyId) {
        const agents = await this.list(companyId, { max: 50 });
        return agents.find((a) => a.isDefault) || agents[0] || null;
    }
}

const aiEmployeeService = new AiEmployeeService();

function uid(prefix = "agent") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAiEmployee(companyId, agentId) {
    const adapter = await getStorageAdapter();
    if (adapter.getAgent) {
        const legacy = await adapter.getAgent(agentId);
        if (legacy && (!legacy.companyId || legacy.companyId === companyId)) return legacy;
    }
    return aiEmployeeService.get(companyId, agentId);
}

export async function listAiEmployees(companyId) {
    const tenantAgents = await aiEmployeeService.list(companyId);
    if (tenantAgents.length) return tenantAgents;

    const adapter = await getStorageAdapter();
    if (adapter.listAgents) {
        const legacy = await adapter.listAgents({ companyId });
        if (legacy.length) return legacy;
    }
    return tenantAgents;
}

export async function findAiEmployeeByNameOrRole(companyId, { name, role } = {}) {
    const agents = await listAiEmployees(companyId);
    const nameLower = String(name || "").toLowerCase().trim();
    const roleLower = String(role || "").toLowerCase().trim();

    if (nameLower) {
        const byName = agents.find((a) => String(a.name || "").toLowerCase().includes(nameLower));
        if (byName) return byName;
    }

    if (roleLower) {
        const byRole = agents.find((a) => {
            const hay = `${a.role || ""} ${a.roleLabel || ""}`.toLowerCase();
            return hay.includes(roleLower);
        });
        if (byRole) return byRole;
    }

    return null;
}

export async function saveAiEmployee(companyId, agentId, data) {
    const adapter = await getStorageAdapter();
    const record = { ...data, id: agentId, companyId };

    if (adapter.saveAgent) {
        await adapter.saveAgent(agentId, record);
    }

    return aiEmployeeService.upsert(companyId, agentId, record);
}

export async function createAiEmployee(companyId, data = {}) {
    if (!companyId) throw new Error("companyId is required");

    const id = data.id || uid("agent");
    const roleLabel = data.roleLabel || data.role || "Reception";
    const template = resolveRoleTemplate(roleLabel);
    const companyName = data.companyName || companyId;
    const knowledgeBaseId = data.knowledgeBaseId || `kb-${companyId}`;

    await ensureKnowledgeBase(companyId, knowledgeBaseId);

    const agents = await listAiEmployees(companyId);
    const isFirst = agents.length === 0;

    const agent = {
        id,
        companyId,
        name: String(data.name || "AI Employee").trim(),
        role: data.role || template.role,
        roleLabel: data.roleLabel || template.roleLabel,
        avatar: data.avatar || "🤖",
        personality: data.personality || template.personality,
        model: data.model || "gpt-4o-mini",
        temperature: Number(data.temperature ?? 0.7),
        memory: data.memory !== false,
        systemPrompt:
            data.systemPrompt ||
            buildEmployeeSystemPrompt({ companyName, roleLabel: data.roleLabel || template.roleLabel }),
        greetingMessage:
            data.greetingMessage ||
            `Hi! I'm ${data.name || "your AI assistant"}. How can I help you today?`,
        knowledgeBaseId,
        status: data.status || "active",
        isDefault: Boolean(data.isDefault ?? isFirst),
        channels: data.channels || { whatsapp: true, websiteChat: true },
        provisionedAt: new Date().toISOString(),
    };

    await saveAiEmployee(companyId, id, agent);
    return agent;
}

export async function updateAiEmployee(companyId, agentId, patch) {
    const existing = await getAiEmployee(companyId, agentId);
    if (!existing) throw new Error(`AI employee not found: ${agentId}`);

    const updated = { ...existing, ...patch, id: agentId, companyId };
    if (patch.roleLabel || patch.role) {
        if (!patch.systemPrompt) {
            updated.systemPrompt = buildEmployeeSystemPrompt({
                companyName: patch.companyName || companyId,
                roleLabel: patch.roleLabel || patch.role,
            });
        }
    }

    return saveAiEmployee(companyId, agentId, updated);
}

export async function deleteAiEmployee(companyId, agentId) {
    const adapter = await getStorageAdapter();
    if (adapter.deleteAgent) {
        await adapter.deleteAgent(agentId).catch(() => {});
    }
    return aiEmployeeService.delete(companyId, agentId);
}

export async function getDefaultAiEmployee(companyId) {
    const fromTenant = await aiEmployeeService.getDefault(companyId);
    if (fromTenant) return fromTenant;

    const adapter = await getStorageAdapter();
    if (adapter.listAgents) {
        const agents = await adapter.listAgents({ companyId });
        return agents.find((a) => a.isDefault) || agents[0] || null;
    }
    return null;
}

export async function saveAgentProvisioning(companyId, agentId, record) {
    const adapter = await getStorageAdapter();
    if (adapter.saveAgentProvisioning) {
        await adapter.saveAgentProvisioning(agentId, { ...record, companyId });
    }
    return aiEmployeeService.update(companyId, agentId, { provisioning: record });
}

export { buildEmployeeSystemPrompt, resolveRoleTemplate };
