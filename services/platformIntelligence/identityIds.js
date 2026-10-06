import { createHash } from "crypto";

/** Global channel-native identity key (one doc per WhatsApp phone, etc.). */
export function channelIdentityDocId(channel, externalUserId) {
    const ch = String(channel || "").trim().toLowerCase();
    const ext = String(externalUserId || "")
        .trim()
        .replace(/[/\\#\[\]]/g, "_");
    return `${ch}::${ext}`;
}

/**
 * Strong PI-4B link: one platform user per stable channel-native id (e.g. WhatsApp phone).
 * No cross-channel merge in this gate.
 */
export function platformUserIdForStrongChannelIdentity(channel, externalUserId) {
    const key = channelIdentityDocId(channel, externalUserId);
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
    return `peu_${hash}`;
}

export function dailyPlatformUserActivityDocId(dateUtc, platformUserId) {
    return `${dateUtc}__${platformUserId}`;
}
