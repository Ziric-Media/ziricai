/**
 * SN-03b — local briefing windows from profile.briefingTimes.
 */
import { DEFAULT_SARAH_NEWS_PROFILE } from "./sarahNewsProfileService.js";

export function localTimeParts(now, timezoneOffsetMinutes = 0) {
    const offset = Number(timezoneOffsetMinutes) || 0;
    const localMs = now.getTime() + offset * 60_000;
    const d = new Date(localMs);
    return {
        dayKey: d.toISOString().slice(0, 10),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        totalMinutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
}

export function parseBriefingClock(hhmm) {
    const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = Math.min(23, Math.max(0, Number(m[1])));
    const minute = Math.min(59, Math.max(0, Number(m[2])));
    return hour * 60 + minute;
}

/**
 * Briefing is due in a 50-minute window after the configured local time (once per day).
 */
export function isBriefingSlotDue(slot, profile, timezoneOffsetMinutes, now = new Date()) {
    if (!profile?.briefings?.[slot]) return false;
    const times = { ...DEFAULT_SARAH_NEWS_PROFILE.briefingTimes, ...(profile.briefingTimes || {}) };
    const target = parseBriefingClock(times[slot]);
    if (target == null) return false;
    const local = localTimeParts(now, timezoneOffsetMinutes);
    const delta = local.totalMinutes - target;
    return delta >= 0 && delta < 50;
}

export function slotsDueNow(profile, timezoneOffsetMinutes, now = new Date()) {
    const out = [];
    for (const slot of ["morning", "lunch", "evening"]) {
        if (isBriefingSlotDue(slot, profile, timezoneOffsetMinutes, now)) out.push(slot);
    }
    return out;
}