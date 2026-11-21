/**
 * CH1 — Resolve tenant inbox conversation id → channel + contact ref (WhatsApp phone vs Sarah App uid).
 */
import { normalizePhone } from "../customerService.js";
import {
    conversationDocId,
    customerDocId,
    resolveSarahAppCustomerId,
    resolveCanonicalConversationId,
} from "../storage/tenantStorage.js";

const KNOWN_CHANNEL_PREFIXES = [
    "whatsapp",
    "sarah_app",
    "facebook",
    "instagram",
    "telegram",
    "webchat",
    "email",
    "sms",
];

/**
 * @param {string} conversationId
 */
export function inferChannelFromConversationId(conversationId) {
    const id = String(conversationId || "").trim();
    for (const ch of KNOWN_CHANNEL_PREFIXES) {
        if (id.startsWith(`${ch}::`)) return ch;
    }
    if (id.includes("sarah_app")) return "sarah_app";
    return null;
}

/**
 * Extract Sarah App Firebase uid from tenant conversation / customer ids.
 * @param {string} conversationIdOrRef
 */
export function resolveSarahAppUidFromRef(conversationIdOrRef) {
    const id = String(conversationIdOrRef || "").trim();
    if (!id) return "";
    if (id.startsWith("sarah_app::sarah_app::")) {
        return id.slice("sarah_app::sarah_app::".length);
    }
    if (id.startsWith("sarah_app::")) {
        const rest = id.slice("sarah_app::".length);
        if (rest.startsWith("sarah_app::")) return rest.slice("sarah_app::".length);
        return rest;
    }
    return id;
}

/**
 * @param {string} conversationId
 * @param {{ channel?: string, listedChannel?: string }} [options]
 */
export function resolveTenantConversationRef(conversationId, options = {}) {
    const channel =
        options.channel ||
        options.listedChannel ||
        inferChannelFromConversationId(conversationId) ||
        "whatsapp";

    if (channel === "sarah_app") {
        const uid = resolveSarahAppUidFromRef(conversationId);
        const customerId = resolveSarahAppCustomerId(uid);
        const canonicalId = conversationDocId(customerId, "sarah_app");
        return { channel, phone: uid, customerId, canonicalId };
    }

    const phone = normalizePhone(conversationId) || conversationId;
    const customerId = customerDocId(phone);
    const canonicalId = resolveCanonicalConversationId(phone, channel);
    return { channel, phone, customerId, canonicalId };
}

/**
 * @param {object[]} convList
 * @param {string} conversationId
 */
export function findConversationInList(convList, conversationId) {
    const id = String(conversationId || "");
    const listedChannel = inferChannelFromConversationId(id);
    const phoneNorm = normalizePhone(id);
    const sarahUid = listedChannel === "sarah_app" ? resolveSarahAppUidFromRef(id) : null;

    return convList.find((c) => {
        if (c.id === id || c.conversationId === id) return true;
        if (sarahUid && (c.customerId === `sarah_app::${sarahUid}` || c.phone === sarahUid)) return true;
        if (phoneNorm && (c.phone === phoneNorm || c.id === phoneNorm)) return true;
        const ch = c.channel || "whatsapp";
        const canonical = resolveCanonicalConversationId(c.phone || c.customerId || c.id, ch);
        return canonical === id;
    });
}

/**
 * @param {object[]} convList
 * @param {string} conversationId
 */
export function resolveListedChannel(convList, conversationId) {
    const hit = findConversationInList(convList, conversationId);
    if (hit?.channel) return hit.channel;
    return inferChannelFromConversationId(conversationId) || "whatsapp";
}
