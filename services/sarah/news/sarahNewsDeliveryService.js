/**
 * SN-03b / SN-04 — briefing push + breaking alerts (inbox + FCM).
 */
import { getSarahNewsProfile } from "./sarahNewsProfileService.js";
import { compileSarahNewsEdition } from "./sarahNewsEditionService.js";
import { slotsDueNow, localTimeParts } from "./sarahNewsBriefingSchedule.js";
import {
    briefingDeliveryId,
    breakingDeliveryId,
    markSarahNewsDeliverySent,
    wasSarahNewsDeliverySent,
} from "./sarahNewsDeliveryStore.js";
import { breakingAlertsForProfile } from "./sarahNewsBreakingService.js";
import { listSarahNewsSubscriberUids } from "./sarahNewsSubscriberIndex.js";
import { listDistinctPushSubscriberUids } from "../../network/pushDeviceService.js";
import { getConsumerNotificationPrefs } from "../../network/consumerNotificationPrefsService.js";
import {
    createSarahNewsBriefingNotification,
    createSarahNewsBreakingNotification,
} from "../../network/notificationService.js";

/**
 * @param {string} uid
 * @param {"morning"|"lunch"|"evening"} slot
 * @param {object} profile
 */
export async function deliverSarahNewsBriefing(uid, slot, profile) {
    const { prefs } = await getConsumerNotificationPrefs(uid).catch(() => ({
        prefs: { timezoneOffsetMinutes: 0 },
    }));
    const tz = Number(prefs?.timezoneOffsetMinutes) || 0;
    const local = localTimeParts(new Date(), tz);
    const deliveryId = briefingDeliveryId(slot, local.dayKey);
    if (await wasSarahNewsDeliverySent(uid, deliveryId)) {
        return { delivered: false, duplicate: true, slot };
    }

    const edition = await compileSarahNewsEdition(profile, { slot, uid, persistEdition: true, useCache: true });
    const top = edition.topStories?.[0] || edition.headlines?.[0];
    if (!top) return { delivered: false, slot, reason: "no_headlines" };

    await createSarahNewsBriefingNotification(uid, {
        slot,
        dayKey: local.dayKey,
        storyId: top.storyId,
        headline: top.headline,
        headlineCount: edition.headlines?.length || 0,
    });
    await markSarahNewsDeliverySent(uid, deliveryId, { slot, storyId: top.storyId });
    return { delivered: true, slot, storyId: top.storyId };
}

/**
 * @param {string} uid
 * @param {object} profile
 */
export async function deliverSarahNewsBreaking(uid, profile) {
    if (!profile?.breaking) return { delivered: [], skipped: "breaking_off" };
    const { prefs } = await getConsumerNotificationPrefs(uid).catch(() => ({
        prefs: { timezoneOffsetMinutes: 0 },
    }));
    const tz = Number(prefs?.timezoneOffsetMinutes) || 0;
    const local = localTimeParts(new Date(), tz);
    const candidates = await breakingAlertsForProfile(profile);
    const delivered = [];
    let sentToday = 0;

    for (const item of candidates) {
        if (sentToday >= 3) break;
        const deliveryId = breakingDeliveryId(item.storyId, local.dayKey);
        if (await wasSarahNewsDeliverySent(uid, deliveryId)) continue;
        await createSarahNewsBreakingNotification(uid, {
            storyId: item.storyId,
            headline: item.headline,
            summary: item.summary,
            confidence: item.confidence,
            dayKey: local.dayKey,
        });
        await markSarahNewsDeliverySent(uid, deliveryId, { storyId: item.storyId });
        delivered.push(item.storyId);
        sentToday += 1;
    }
    return { delivered };
}

/**
 * Per-user poll (app foreground or GET due) — briefings + breaking.
 * @param {string} uid
 */
export async function pollSarahNewsDeliveryForUser(uid) {
    const profile = await getSarahNewsProfile(uid);
    if (!profile?.regions?.length) {
        return { ok: false, code: "NEWS_PROFILE_MISSING" };
    }
    const { prefs } = await getConsumerNotificationPrefs(uid);
    const tz = Number(prefs?.timezoneOffsetMinutes) || 0;
    const dueSlots = slotsDueNow(profile, tz);
    const briefings = [];
    for (const slot of dueSlots) {
        const r = await deliverSarahNewsBriefing(uid, slot, profile);
        if (r.delivered) briefings.push(slot);
    }
    const breaking = await deliverSarahNewsBreaking(uid, profile);
    return {
        ok: true,
        briefings,
        breaking: breaking.delivered || [],
        dueSlots,
    };
}

/** Background scheduler — all indexed subscribers. */
export async function runSarahNewsSchedulerTick() {
    const indexed = await listSarahNewsSubscriberUids();
    const pushUids = await listDistinctPushSubscriberUids();
    const uids = [...new Set([...indexed, ...pushUids])];
    let briefings = 0;
    let breaking = 0;
    for (const uid of uids) {
        try {
            const r = await pollSarahNewsDeliveryForUser(uid);
            if (r.briefings?.length) briefings += r.briefings.length;
            if (r.breaking?.length) breaking += r.breaking.length;
        } catch (err) {
            console.warn("[sarahNews] scheduler uid failed:", uid, err.message);
        }
    }
    return { users: uids.length, briefings, breaking };
}