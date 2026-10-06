/**
 * Record normalized platform communication events (PI-4A).
 */
import { PI_CHANNELS, PI_DIRECTION, PI_EVENT_TYPES } from "./constants.js";
import { buildPlatformMessageEventId, utcDateKey } from "./eventIds.js";
import { claimPlatformMessageEvent } from "./platformIntelligenceStore.js";
import { applyDimensionalRollupsForMessage } from "./dimensionalRollups.js";
import { resolveOrganisationSegmentSnapshot } from "./organisationSegmentSnapshot.js";

/**
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.channel
 * @param {'inbound'|'outbound'} input.direction
 * @param {string} input.conversationId
 * @param {string} input.messageId
 * @param {string} input.externalUserId
 * @param {string} [input.timestamp]
 * @param {string} [input.eventType]
 */
export async function recordMessageEvent(input) {
    const companyId = String(input.companyId || "").trim();
    const channel = String(input.channel || "").trim().toLowerCase();
    const messageId = String(input.messageId || "").trim();
    const externalUserId = String(input.externalUserId || "").trim();
    const conversationId = String(input.conversationId || "").trim();
    const direction =
        input.direction === PI_DIRECTION.OUTBOUND ? PI_DIRECTION.OUTBOUND : PI_DIRECTION.INBOUND;
    const timestamp = input.timestamp || new Date().toISOString();
    const eventType =
        input.eventType ||
        (direction === PI_DIRECTION.INBOUND ? PI_EVENT_TYPES.MESSAGE_RECEIVED : PI_EVENT_TYPES.MESSAGE_SENT);

    if (!companyId || !channel || !messageId || !externalUserId) {
        throw new Error("recordMessageEvent: companyId, channel, messageId, externalUserId required");
    }

    const segment = await resolveOrganisationSegmentSnapshot(companyId);

    const eventId = buildPlatformMessageEventId({ channel, companyId, messageId });
    const payload = {
        companyId,
        channel,
        direction,
        eventType,
        conversationId,
        messageId,
        externalUserId,
        timestamp,
        organisationTypeSnapshot: segment.organisationType,
        sectorSnapshot: segment.sectorId,
        sectorLabelSnapshot: segment.sectorLabel,
    };

    const { created } = await claimPlatformMessageEvent(eventId, payload);
    if (!created) {
        return { recorded: false, duplicate: true, eventId };
    }

    await applyDimensionalRollupsForMessage({
        timestamp,
        companyId,
        channel,
        direction,
        externalUserId,
        conversationId,
        organisationTypeSnapshot: segment.organisationType,
        sectorSnapshot: segment.sectorId,
        sectorLabelSnapshot: segment.sectorLabel,
    });

    let identity = null;
    try {
        const { attachEndUserIdentityForMessage } = await import("./endUserIdentityStore.js");
        const { applyPeriodUserRollupsForMessage } = await import("./periodUserRollups.js");
        identity = await attachEndUserIdentityForMessage({
            channel,
            externalUserId,
            companyId,
            timestamp,
        });
        if (identity && !identity.skipped) {
            await applyPeriodUserRollupsForMessage(timestamp, identity, segment);
        }
    } catch (err) {
        console.warn("[platformIntelligence] end-user identity attach failed:", err.message);
    }

    const date = utcDateKey(timestamp);
    return { recorded: true, duplicate: false, eventId, date, identity, segmentSnapshot: segment };
}

/**
 * Non-blocking hook after tenant message persistence (WhatsApp PI-4A).
 * @param {object} params
 */
export async function recordWhatsAppMessageEventAfterPersist(params) {
    const {
        companyId,
        channel,
        role,
        conversationId,
        messageId,
        customerId,
        createdAt,
    } = params;

    if (String(channel || "").toLowerCase() !== PI_CHANNELS.WHATSAPP) return { skipped: true };
    if (!companyId || !messageId || !customerId) return { skipped: true };

    const direction = role === "assistant" ? PI_DIRECTION.OUTBOUND : PI_DIRECTION.INBOUND;

    return recordMessageEvent({
        companyId,
        channel: PI_CHANNELS.WHATSAPP,
        direction,
        conversationId,
        messageId,
        externalUserId: customerId,
        timestamp: createdAt || new Date().toISOString(),
    });
}
