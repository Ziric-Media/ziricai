/**
 * Human takeover runtime safety — authoritative state from tenant conversation docs.
 * Customer.mode is NOT used for enforcement (conversation.humanTakeover / mode only).
 */
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { normalizePhone } from "../customerService.js";
import {
    conversationDocId,
    customerDocId,
    getTenantConversation,
    resolveCanonicalConversationId,
} from "../storage/tenantStorage.js";

const conversationsRepo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);

export function isHumanControlledConversation(meta) {
    if (!meta || typeof meta !== "object") return false;
    return meta.humanTakeover === true || meta.mode === "human";
}

/**
 * Load takeover state from the canonical conversation document.
 * Falls back to legacy phone-only docs (pre-3A) and lazily backfills canonical.
 */
export async function getConversationTakeoverState(companyId, phoneOrId, channel = "whatsapp") {
    if (!companyId) {
        return { humanControlled: false, meta: null, conversationId: null, phone: null };
    }

    const phone = normalizePhone(phoneOrId) || phoneOrId;
    const conversationId = resolveCanonicalConversationId(phone, channel);

    let meta = (await getTenantConversation(companyId, phone, channel)) || {};

    if (isHumanControlledConversation(meta)) {
        return { humanControlled: true, meta, conversationId, phone };
    }

    const legacyId = normalizePhone(phone);
    if (legacyId && legacyId !== conversationId) {
        const legacy = (await conversationsRepo.get(companyId, legacyId)) || null;
        if (legacy && isHumanControlledConversation(legacy)) {
            const merged = {
                humanTakeover: legacy.humanTakeover === true,
                mode: legacy.mode || "human",
                assignedHumanAgent: legacy.assignedHumanAgent || null,
                updatedAt: new Date().toISOString(),
            };
            await conversationsRepo.set(companyId, conversationId, merged);
            meta = { ...meta, ...merged };
            return { humanControlled: true, meta, conversationId, phone, migratedFrom: legacyId };
        }
    }

    return { humanControlled: false, meta, conversationId, phone };
}

export { resolveCanonicalConversationId, conversationDocId, customerDocId };
