/**
 * Conversation service — tenant-scoped unified inbox with multi-channel support.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    saveInboundMessage,
    saveOutboundMessage,
    getConversation as legacyGetConversation,
    listConversations as legacyListConversations,
    upsertCustomerFromWhatsApp,
} from "../conversationService.js";
import { sendMessage as integrationSend } from "../integrations/integrationHub.js";
import { publish, EventTypes } from "../events/index.js";
import { normalizePhone } from "../customerService.js";
import {
    getTenantConversation as getCanonicalConversationMeta,
    resolveCanonicalConversationId,
    customerDocId,
} from "../storage/tenantStorage.js";
import { getConversationTakeoverState } from "../conversation/takeoverSafety.js";

const CHANNEL_LABELS = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    telegram: "Telegram",
    webchat: "Web",
    email: "Email",
    sms: "SMS",
};

const CHANNEL_COLORS = {
    whatsapp: "green",
    facebook: "blue",
    instagram: "purple",
    telegram: "blue",
    webchat: "purple",
    email: "yellow",
    sms: "grey",
};

class ConversationService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.CONVERSATIONS);
    }
}

const conversationRepo = new ConversationService();

export {
    saveInboundMessage,
    saveOutboundMessage,
    upsertCustomerFromWhatsApp,
};

function formatRelativeTime(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function resolvePhoneFromConversationRef(conversationId) {
    return normalizePhone(conversationId) || conversationId;
}

function findListedConversation(convList, conversationId, phone) {
    const canonicalId = resolveCanonicalConversationId(phone, "whatsapp");
    return convList.find(
        (c) =>
            c.phone === phone ||
            c.id === conversationId ||
            c.id === canonicalId ||
            c.id === phone
    );
}

function mapConversationRow(conv, companyId) {
    const channel = conv.channel || "whatsapp";
    const phone = conv.customerId || conv.phone || resolvePhoneFromConversationRef(conv.id);
    const id = conv.conversationId || conv.id || resolveCanonicalConversationId(phone, channel);
    return {
        id,
        phone,
        customerName: conv.customerName || conv.name || phone || "Unknown",
        name: conv.name || conv.customerName,
        lastMessage: conv.lastMessage || conv.preview || "",
        preview: conv.preview || conv.lastMessage || "",
        status: conv.status || "in_progress",
        mode: conv.mode || "ai",
        humanTakeover: Boolean(conv.humanTakeover),
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        channelColor: CHANNEL_COLORS[channel] || "grey",
        time: conv.time ? formatRelativeTime(conv.time) : formatRelativeTime(conv.lastSeen || conv.updatedAt),
        lastMessageAt: conv.time || conv.lastSeen || conv.updatedAt,
        unread: Boolean(conv.unread ?? conv.online),
        leadScore: conv.leadScore ?? null,
        tags: conv.tags || [],
        companyId: conv.companyId || companyId,
    };
}

export async function getConversation(phone, max = 20) {
    return legacyGetConversation(phone, max);
}

export async function listConversations(options = {}) {
    return legacyListConversations(options);
}

export async function upsertConversationMeta(companyId, conversationIdOrPhone, meta = {}) {
    const channel = meta.channel || "whatsapp";
    const canonicalId = resolveCanonicalConversationId(conversationIdOrPhone, channel);
    return conversationRepo.upsert(companyId, canonicalId, meta);
}

export async function listTenantConversations(companyId, options = {}) {
    const limit = options.limit || 50;
    const legacy = await legacyListConversations({ companyId, limit });
    if (legacy.length) {
        return legacy.map((c) => mapConversationRow(c, companyId));
    }
    const tenant = await conversationRepo.list(companyId, { max: limit });
    if (tenant.length) {
        return tenant.map((c) => mapConversationRow(c, companyId));
    }
    return legacy.map((c) => mapConversationRow(c, companyId));
}

export async function getTenantConversation(companyId, conversationId) {
    const phone = resolvePhoneFromConversationRef(conversationId);
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const conv = findListedConversation(convList, conversationId, phone);
    const channel = conv?.channel || "whatsapp";
    const canonicalId = resolveCanonicalConversationId(phone, channel);

    const meta = (await getCanonicalConversationMeta(companyId, phone, channel)) || {};
    const history = await legacyGetConversation(phone, 50, { companyId, channel });
    const takeoverState = await getConversationTakeoverState(companyId, phone, channel);

    const messages = history.map((m, idx) => ({
        id: `msg-${idx}`,
        role: m.role === "assistant" ? "ai" : m.role === "user" ? "customer" : m.role,
        content: m.content,
        message: m.content,
    }));

    const mergedMeta = takeoverState.meta || meta;

    return {
        conversation: mapConversationRow(
            { ...conv, ...mergedMeta, id: canonicalId, phone, conversationId: canonicalId },
            companyId
        ),
        messages,
        channel,
        humanTakeover: Boolean(mergedMeta.humanTakeover),
    };
}

export async function sendConversationReply(companyId, conversationId, { text, channel }) {
    const phone = resolvePhoneFromConversationRef(conversationId);
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const conv = findListedConversation(convList, conversationId, phone);
    const outboundChannel = channel || conv?.channel || "whatsapp";

    await saveOutboundMessage(phone, text, { companyId, channel: outboundChannel });
    try {
        await integrationSend(outboundChannel, { companyId }, { to: phone, text });
    } catch (err) {
        console.warn("[conversationService] outbound send:", err.message);
    }

    await publish(companyId, EventTypes.MESSAGE_SENT, {
        phone,
        text,
        channel: outboundChannel,
        source: "human",
    });

    return {
        success: true,
        conversationId: resolveCanonicalConversationId(phone, outboundChannel),
        phone,
        channel: outboundChannel,
    };
}

export async function setHumanTakeover(companyId, conversationId, { enabled = true, humanAgent = "Staff" } = {}) {
    const phone = resolvePhoneFromConversationRef(conversationId);
    const channel = "whatsapp";
    const canonicalId = resolveCanonicalConversationId(phone, channel);

    await conversationRepo.upsert(companyId, canonicalId, {
        humanTakeover: enabled,
        mode: enabled ? "human" : "ai",
        assignedHumanAgent: enabled ? humanAgent : null,
        customerId: customerDocId(phone),
        conversationId: canonicalId,
        channel,
        updatedAt: new Date().toISOString(),
    });

    const legacyId = normalizePhone(phone);
    if (legacyId && legacyId !== canonicalId) {
        const legacy = await conversationRepo.get(companyId, legacyId);
        if (legacy && (legacy.humanTakeover || legacy.mode === "human")) {
            await conversationRepo.upsert(companyId, legacyId, {
                humanTakeover: false,
                mode: "ai",
                assignedHumanAgent: null,
                migratedTo: canonicalId,
                updatedAt: new Date().toISOString(),
            });
        }
    }

    await upsertCustomerFromWhatsApp(phone, {
        companyId,
        mode: enabled ? "human" : "ai",
        assignedHumanAgent: enabled ? humanAgent : null,
    });

    return {
        success: true,
        conversationId: canonicalId,
        phone,
        humanTakeover: enabled,
        mode: enabled ? "human" : "ai",
        humanAgent: enabled ? humanAgent : null,
    };
}

export { CHANNEL_LABELS, CHANNEL_COLORS, getConversationTakeoverState };
