/**
 * EDU-05 — verified-guardian audience for school subscriber events.
 */
import { ORG_PREF_KEYS, effectivePrefs, getConnectionStatus } from "../network/connectionService.js";
import { getOrgEntityByCompanyId } from "../network/networkIdentityService.js";
import { listApprovedGuardianUids, schoolRequiresVerifiedGuardiansForCompany } from "./schoolGuardianService.js";

const S = { SUBSCRIBED: "subscribed", CONNECTED: "connected" };

/**
 * @param {string} companyId
 * @param {string} channel announcements|notifications|reminders
 * @param {{ campusId?: string, limit?: number }} [opts]
 */
export async function listSchoolNotificationRecipients(companyId, channel, { campusId = "", limit = 5000 } = {}) {
    if (!ORG_PREF_KEYS.includes(channel)) return [];
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) return [];
    const approved = new Set(await listApprovedGuardianUids(companyId, campusId || ""));
    const out = [];
    for (const uid of approved) {
        const conn = await getConnectionStatus(uid, entity.snId);
        if (!conn || ![S.SUBSCRIBED, S.CONNECTED].includes(conn.state)) continue;
        const prefs = effectivePrefs(conn);
        if (!prefs[channel]) continue;
        out.push({ uid, snId: entity.snId });
        if (out.length >= limit) break;
    }
    return out;
}

/** @param {string} companyId @param {string} channel @param {{ campusId?: string }} [opts] */
export async function countSchoolCommsAudience(companyId, channel, { campusId = "" } = {}) {
    const byChannel = Object.fromEntries(ORG_PREF_KEYS.map((k) => [k, 0]));
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) return { subscribers: 0, byChannel, snId: null, schoolMode: true };
    const approved = await listApprovedGuardianUids(companyId, campusId || "");
    let subscribers = 0;
    for (const uid of approved) {
        const conn = await getConnectionStatus(uid, entity.snId);
        if (!conn || ![S.SUBSCRIBED, S.CONNECTED].includes(conn.state)) continue;
        subscribers += 1;
        const prefs = effectivePrefs(conn);
        for (const k of ORG_PREF_KEYS) if (prefs[k]) byChannel[k] += 1;
    }
    return { subscribers, byChannel, snId: entity.snId, schoolMode: true, campusId: campusId || null };
}

export async function usesSchoolVerifiedAudience(companyId) {
    return schoolRequiresVerifiedGuardiansForCompany(companyId);
}
