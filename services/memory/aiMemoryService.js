import { getStorageAdapter } from "../storage/storageAdapter.js";
import {
    saveTenantMemory,
    getTenantMemories,
    formatTenantMemoriesForPrompt,
} from "../storage/tenantStorage.js";

/**
 * Store a customer memory fact.
 * @param {string} customerId — phone or customer id
 * @param {string} agentId
 * @param {string} fact
 * @param {{ companyId?: string|null }} [options]
 */
export async function storeMemory(customerId, agentId, fact, options = {}) {
    const { companyId } = options;
    if (companyId) {
        return saveTenantMemory(companyId, customerId, agentId, fact);
    }
    const adapter = await getStorageAdapter();
    return adapter.saveMemory(customerId, agentId, fact);
}

/**
 * Retrieve customer memories.
 * @param {string} customerId
 * @param {string} agentId
 * @param {{ companyId?: string|null }} [options]
 */
export async function getMemories(customerId, agentId, options = {}) {
    const { companyId } = options;
    if (companyId) {
        return getTenantMemories(companyId, customerId, agentId);
    }
    const adapter = await getStorageAdapter();
    return adapter.getMemories(customerId, agentId);
}

/**
 * Format memories for AI prompt injection.
 */
export async function getMemoryContext(customerId, agentId, options = {}) {
    const { companyId } = options;
    if (companyId) {
        return formatTenantMemoriesForPrompt(companyId, customerId, agentId);
    }
    const memories = await getMemories(customerId, agentId);
    if (!memories.length) return "";
    return `Customer memories:\n${memories.map((m) => `- ${m.fact || m}`).join("\n")}`;
}

export { formatTenantMemoriesForPrompt };
