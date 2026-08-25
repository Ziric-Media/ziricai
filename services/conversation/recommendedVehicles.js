/**
 * Conversation-scoped vehicle recommendations — bridges searchInventory → bookTestDrive.
 */
import {
    customerDocId,
    conversationDocId,
    getTenantConversation,
    getOrCreateConversation,
    conversationsRepo,
} from "../storage/tenantStorage.js";
import { pickByHint, pickByOrdinal } from "./vehicleReference.js";

export async function getRecommendedVehicles(companyId, phone, channel = "whatsapp") {
    if (!companyId || !phone) return [];
    const conversationId = conversationDocId(customerDocId(phone), channel);
    const conv = await getTenantConversation(companyId, phone, channel);
    if (!conv) return [];
    return conv.meta?.lastRecommendedVehicles || conv.lastRecommendedVehicles || [];
}

export async function storeRecommendedVehicles(companyId, phone, channel = "whatsapp", vehicles = []) {
    if (!companyId || !phone || !vehicles?.length) return [];
    const conversationId = conversationDocId(customerDocId(phone), channel);
    const existing = (await getTenantConversation(companyId, phone, channel)) || {};
    const prior = existing.meta?.lastRecommendedVehicles || existing.lastRecommendedVehicles || [];

    const merged = [...vehicles];
    for (const p of prior) {
        if (!merged.some((v) => v.vehicleId === p.vehicleId)) merged.push(p);
    }

    const trimmed = merged.slice(0, 20);
    await getOrCreateConversation(companyId, phone, channel);
    await conversationsRepo.update(companyId, conversationId, {
        meta: { ...(existing.meta || {}), lastRecommendedVehicles: trimmed },
        lastRecommendedVehicles: trimmed,
    });
    return trimmed;
}

/**
 * Resolve a vehicle from conversation context when booking without explicit id/stock.
 * @param {object[]} recommended
 * @param {string} [hint] — make/model substring from customer message
 */
export function pickFromRecommended(recommended, hint) {
    if (!recommended?.length) return null;
    if (!hint) return recommended.length === 1 ? recommended[0] : null;

    const ordinal = pickByOrdinal(recommended, hint);
    if (ordinal) return ordinal;
    return pickByHint(recommended, hint);
}
