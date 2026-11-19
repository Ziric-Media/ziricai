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
import { mapMessageForInboxApi } from "../conversation/inboxMessageContract.js";
import { buildSlimInboxContext } from "../conversation/inboxContext.js";
import {
    findConversationInList,
    resolveListedChannel,
    resolveTenantConversationRef,
    resolveSarahAppUidFromRef,
} from "../conversation/tenantConversationRef.js";
import { mirrorSarahAppHumanReplyToConsumer } from "../users/sarahAppConsumerMirrorService.js";
import { openUserConversation, getUserConversationByCompany } from "../users/userConversationService.js";
import { toIsoTimestamp } from "../core/timestampUtils.js";
import { ownershipStateFromTakeover } from "../users/handoverStateService.js";
import { getConsumerProfile } from "../users/consumerProfileService.js";
import { getUserProfile } from "../auth/authService.js";

const CHANNEL_LABELS = {
    whatsapp: "WhatsApp",
    sarah_app: "Sarah App · Sarah Inbox",
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
    const normalized = toIsoTimestamp(iso) || iso;
    const ms = new Date(normalized).getTime();
    if (!Number.isFinite(ms)) return "Recently";
    const diff = Date.now() - ms;
    if (diff < 0) return "Just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (!Number.isFinite(days)) return "Recently";
    return `${days}d ago`;
}

function resolvePhoneFromConversationRef(conversationId) {
    return normalizePhone(conversationId) || conversationId;
}

function findListedConversation(convList, conversationId, phone) {
    return findConversationInList(convList, conversationId) ||
        convList.find(
            (c) =>
                c.phone === phone ||
                c.id === conversationId ||
                c.id === resolveCanonicalConversationId(phone, c.channel || "whatsapp") ||
                c.id === phone
        );
}

async function resolveConsumerPhotoUrl(conv) {
    const channel = conv.channel || "whatsapp";
    if (channel !== "sarah_app") {
        return conv.customerPhotoUrl || conv.avatarUrl || conv.photoURL || null;
    }
    if (conv.customerPhotoUrl || conv.avatarUrl || conv.photoURL) {
        return conv.customerPhotoUrl || conv.avatarUrl || conv.photoURL;
    }
    const uid = resolveSarahAppUidFromRef(conv.customerId || conv.phone || conv.id);
    if (!uid) return null;
    try {
        const [consumer, global] = await Promise.all([getConsumerProfile(uid), getUserProfile(uid)]);
        return consumer?.photoURL || consumer?.photoUrl || global?.photoURL || null;
    } catch {
        return null;
    }
}

async function attachConsumerPhotos(rows) {
    await Promise.all(
        rows.map(async (row) => {
            const url = await resolveConsumerPhotoUrl(row);
            if (url) row.customerPhotoUrl = url;
        })
    );
    return rows;
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
        customerPhotoUrl: conv.customerPhotoUrl || conv.avatarUrl || conv.photoURL || null,
        lastMessage: conv.lastMessage || conv.preview || "",
        preview: conv.preview || conv.lastMessage || "",
        status: conv.status || "in_progress",
        mode: conv.mode || "ai",
        humanTakeover: Boolean(conv.humanTakeover),
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        channelColor: CHANNEL_COLORS[channel] || "grey",
        time: formatRelativeTime(conv.lastSeen || conv.updatedAt || conv.time),
        lastMessageAt: toIsoTimestamp(conv.lastSeen || conv.updatedAt || conv.time) || null,
        unread: Boolean(conv.unread ?? conv.online),
        readAt: conv.readAt || null,
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
        const rows = legacy.map((c) => mapConversationRow(c, companyId));
        return attachConsumerPhotos(rows);
    }
    const tenant = await conversationRepo.list(companyId, { max: limit });
    if (tenant.length) {
        const rows = tenant.map((c) => mapConversationRow(c, companyId));
        return attachConsumerPhotos(rows);
    }
    const rows = legacy.map((c) => mapConversationRow(c, companyId));
    return attachConsumerPhotos(rows);
}

export async function getTenantConversation(companyId, conversationId) {
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const listedChannel = resolveListedChannel(convList, conversationId);
    const ref = resolveTenantConversationRef(conversationId, { listedChannel });
    const { phone, channel, canonicalId, customerId } = ref;

    const conv =
        findConversationInList(convList, conversationId) ||
        findListedConversation(convList, conversationId, phone);

    let meta = (await conversationRepo.get(companyId, canonicalId)) || {};
    if (!Object.keys(meta).length) {
        meta = (await getCanonicalConversationMeta(companyId, phone, channel)) || {};
    }

    const history = await legacyGetConversation(phone, 100, {
        companyId,
        channel,
        externalUserId: channel === "sarah_app" ? phone : undefined,
    });
    const takeoverState = await getConversationTakeoverState(companyId, phone, channel);

    const messages = history.map((m) => mapMessageForInboxApi(m));

    const mergedMeta = { ...meta, ...(takeoverState.meta || {}) };
    let customerName =
        conv?.customerName || conv?.name || mergedMeta.customerName || mergedMeta.name || null;

    if (channel === "sarah_app") {
        const userConv = getUserConversationByCompany(phone, companyId);
        const fromConsumer = userConv?.consumerDisplayName;
        if (fromConsumer && fromConsumer !== "Sarah App user") {
            customerName = fromConsumer;
        } else if (mergedMeta.customerName && mergedMeta.customerName !== "Sarah App user") {
            customerName = mergedMeta.customerName;
        }
    }

    const context = await buildSlimInboxContext(companyId, phone);

    const photoUrl = await resolveConsumerPhotoUrl({
        channel,
        customerId,
        phone,
        id: canonicalId,
    });

    return {
        conversation: mapConversationRow(
            {
                ...conv,
                ...mergedMeta,
                id: canonicalId,
                phone,
                customerId,
                conversationId: canonicalId,
                channel,
                customerName: customerName || conv?.customerName,
                name: customerName || conv?.name,
                ...(photoUrl ? { customerPhotoUrl: photoUrl } : {}),
            },
            companyId
        ),
        messages,
        channel,
        humanTakeover: Boolean(mergedMeta.humanTakeover),
        context,
    };
}

export async function sendConversationReply(companyId, conversationId, { text, channel, senderName }) {
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const listedChannel = resolveListedChannel(convList, conversationId);
    const ref = resolveTenantConversationRef(conversationId, {
        channel: channel || listedChannel,
        listedChannel,
    });
    const { phone, channel: outboundChannel, canonicalId } = ref;

    await saveOutboundMessage(phone, text, {
        companyId,
        channel: outboundChannel,
        source: "human",
        senderName: senderName || null,
        externalUserId: outboundChannel === "sarah_app" ? phone : undefined,
    });
    if (outboundChannel === "sarah_app") {
        await mirrorSarahAppHumanReplyToConsumer(companyId, canonicalId, text, { senderName });
    }
    if (outboundChannel !== "sarah_app") {
        try {
            await integrationSend(outboundChannel, { companyId }, { to: phone, text });
        } catch (err) {
            console.warn("[conversationService] outbound send:", err.message);
        }
    }

    await publish(companyId, EventTypes.MESSAGE_SENT, {
        phone,
        text,
        channel: outboundChannel,
        source: "human",
    });

    return {
        success: true,
        conversationId: canonicalId,
        phone,
        channel: outboundChannel,
    };
}

export async function markConversationRead(companyId, conversationId) {
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const listedChannel = resolveListedChannel(convList, conversationId);
    const { phone, channel, canonicalId, customerId } = resolveTenantConversationRef(conversationId, {
        listedChannel,
    });

    const existing =
        (await conversationRepo.get(companyId, canonicalId)) ||
        (await conversationRepo.get(companyId, conversationId));
    if (!existing) {
        throw Object.assign(new Error("Conversation not found"), { status: 404, code: "NOT_FOUND" });
    }

    const readAt = new Date().toISOString();
    await conversationRepo.upsert(companyId, canonicalId, {
        unread: false,
        readAt,
        conversationId: canonicalId,
        customerId,
        channel,
        updatedAt: readAt,
    });

    return {
        success: true,
        conversationId: canonicalId,
        unread: false,
        readAt,
    };
}

export async function setHumanTakeover(companyId, conversationId, { enabled = true, humanAgent = "Staff" } = {}) {
    const convList = await legacyListConversations({ companyId, limit: 100 });
    const listedChannel = resolveListedChannel(convList, conversationId);
    const { phone, channel, canonicalId, customerId } = resolveTenantConversationRef(conversationId, {
        listedChannel,
    });

    await conversationRepo.upsert(companyId, canonicalId, {
        humanTakeover: enabled,
        mode: enabled ? "human" : "ai",
        assignedHumanAgent: enabled ? humanAgent : null,
        customerId,
        conversationId: canonicalId,
        channel,
        updatedAt: new Date().toISOString(),
    });

    if (channel === "sarah_app") {
        const uid = resolveSarahAppUidFromRef(canonicalId);
        if (uid) {
            await openUserConversation(uid, companyId, {});
            const conv = getUserConversationByCompany(uid, companyId);
            if (conv) {
                conv.ownershipState = ownershipStateFromTakeover(enabled, conv.ownershipState);
                conv.assignedEmployeeId = enabled ? humanAgent : null;
            }
        }
    }

    if (channel === "whatsapp") {
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
    }

    return {
        success: true,
        conversationId: canonicalId,
        phone,
        channel,
        humanTakeover: enabled,
        mode: enabled ? "human" : "ai",
        humanAgent: enabled ? humanAgent : null,
    };
}

export { CHANNEL_LABELS, CHANNEL_COLORS, getConversationTakeoverState };

