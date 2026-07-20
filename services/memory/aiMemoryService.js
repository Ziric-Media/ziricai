import { getStorageAdapter } from "../storage/storageAdapter.js";

export async function storeMemory(customerId, agentId, fact) {
    const adapter = await getStorageAdapter();
    return adapter.saveMemory(customerId, agentId, fact);
}

export async function getMemories(customerId, agentId) {
    const adapter = await getStorageAdapter();
    return adapter.getMemories(customerId, agentId);
}
