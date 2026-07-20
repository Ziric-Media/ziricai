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

function mapConversationRow(conv, companyId) {
    const channel = conv.channel || "whatsapp";
    return {
        id: conv.id || conv.phone,
        phone: conv.phone || conv.id,
        customerName: conv.customerName || conv.name || conv.phone || "Unknown",
        name: conv.name || conv.customerName,
        lastMessage: conv.lastMessage || conv.preview || "",
        preview: conv.preview || conv.lastMessage || "",
        status: conv.status || "in_progress",
        mode: conv.mode || "ai",
        humanTakeover: Boolean(conv.humanTakeover),
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        channelColor: CHANNEL_COLORS[channel] || "grey",
        time: conv.time ? formatRelativeTime(conv.time) : formatRelativeTime(conv.lastSeen),
        lastMessageAt: conv.time || conv.lastSeen,
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

export async function upsertConversationMeta(companyId, conversationId, meta) {
    return conversationRepo.upsert(companyId, conversationId, meta);
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
    const id = normalizePhone(conversationId) || conversationId;
    const meta = (await conversationRepo.get(companyId, id)) || {};
    const history = await legacyGetConversation(id, 50);
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const conv = convList.find((c) => c.phone === id || c.id === id);
    const channel = meta.channel || conv?.channel || "whatsapp";

    const messages = history.map((m, idx) => ({
        id: `msg-${idx}`,
        role: m.role === "assistant" ? "ai" : m.role === "user" ? "customer" : m.role,
        content: m.content,
        message: m.content,
    }));

    return {
        conversation: mapConversationRow({ ...conv, ...meta, id, phone: id }, companyId),
        messages,
        channel,
        humanTakeover: Boolean(meta.humanTakeover),
    };
}

export async function sendConversationReply(companyId, conversationId, { text, channel }) {
    const id = normalizePhone(conversationId) || conversationId;
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const conv = convList.find((c) => c.phone === id || c.id === id);
    const outboundChannel = channel || conv?.channel || "whatsapp";

    await saveOutboundMessage(id, text);
    try {
        await integrationSend(outboundChannel, { companyId }, { to: id, text });
    } catch (err) {
        console.warn("[conversationService] outbound send:", err.message);
    }

    await publish(companyId, EventTypes.MESSAGE_SENT, {
        phone: id,
        text,
        channel: outboundChannel,
        source: "human",
    });

    return { success: true, conversationId: id, channel: outboundChannel };
}

export async function setHumanTakeover(companyId, conversationId, { enabled = true, humanAgent = "Staff" } = {}) {
    const id = normalizePhone(conversationId) || conversationId;
    await conversationRepo.upsert(companyId, id, {
        humanTakeover: enabled,
        mode: enabled ? "human" : "ai",
        assignedHumanAgent: enabled ? humanAgent : null,
        updatedAt: new Date().toISOString(),
    });
    await upsertCustomerFromWhatsApp(id, {
        companyId,
        mode: enabled ? "human" : "ai",
        assignedHumanAgent: enabled ? humanAgent : null,
    });
    return { success: true, conversationId: id, humanTakeover: enabled, humanAgent: enabled ? humanAgent : null };
}

export { CHANNEL_LABELS, CHANNEL_COLORS };
