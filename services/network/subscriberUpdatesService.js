/**
 * Gate 6 — subscriber "updates" (pull delivery MVP).
 *
 * Gate 5 logs what a business wants to tell its subscribers (`networkSubscriberEvents`, no recipients stored).
 * This is the consumer side: a signed-in person asks for the updates of the organisations they are subscribed (or
 * connected) to. There is no fan-out and no per-recipient record — the feed is computed at read time from
 *   relationship (valid consent, not blocked)  ×  event log of that organisation  ×  the user's channel preferences.
 *
 * Rules:
 *   - only `subscribed` / `connected` relationships with a still-valid consent grant (following ≠ subscribed);
 *   - only events created at/after the user's current subscription started (no back-reading of old announcements);
 *   - the event's channel (announcements / notifications / reminders) must be enabled in My Organisations prefs;
 *   - unlisted or suspended organisations contribute nothing; business-side blocks are never shown;
 *   - the payload never carries `companyId`, other users, audience counts or the actor (`createdBy`).
 * This does not push anything (no inbox message, no device push): `delivered` on the stored event stays 0 and the
 * push worker remains the open SNET-07 gap.
 */
import { getBusinessDirectoryEntry, hydrateBusinessDirectory } from "../users/businessDirectoryService.js";
import { getEntityBySnId } from "./networkIdentityService.js";
import { effectivePrefs, listMyOrganisationConnections } from "./connectionService.js";
import { listSubscriberEvents } from "./subscriberEventService.js";

const MAX_ORGS = 30;
const DEFAULT_LIMIT = 30;

/** When the current subscribed/connected stretch began (last transition into one of those states). */
function subscribedSince(conn) {
    const history = Array.isArray(conn.history) ? conn.history : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const h = history[i];
        if (h.to === "subscribed" || h.to === "connected") {
            // keep walking back while the previous hop is also subscribed/connected (subscribed → connected)
            let at = h.at;
            while (i > 0 && (history[i - 1].to === "subscribed" || history[i - 1].to === "connected")) {
                i -= 1;
                at = history[i].at;
            }
            return at;
        }
    }
    return conn.createdAt || null;
}

/**
 * @param {string} uid
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ updates: object[], organisations: number, delivery: "pull" }>}
 */
export async function listUpdatesForUser(uid, { limit = DEFAULT_LIMIT } = {}) {
    const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 100);
    const rows = (await listMyOrganisationConnections(uid)).filter(({ conn }) => ["subscribed", "connected"].includes(conn.state));
    if (rows.some(({ conn }) => !getBusinessDirectoryEntry(conn.companyId))) await hydrateBusinessDirectory();

    const updates = [];
    for (const { conn } of rows.slice(0, MAX_ORGS)) {
        const entry = getBusinessDirectoryEntry(conn.companyId);
        const entity = await getEntityBySnId(conn.snId).catch(() => null);
        if (!entry || entry.discoverability !== "public" || !entity || entity.status === "suspended") continue;

        const since = subscribedSince(conn);
        const prefs = effectivePrefs(conn);
        const events = await listSubscriberEvents(conn.companyId, { limit: 100 });
        for (const e of events) {
            if (!prefs[e.channel]) continue;
            if (since && String(e.createdAt) < String(since)) continue;
            updates.push({
                eventId: e.eventId,
                snId: conn.snId,
                type: e.type,
                title: e.title,
                body: e.body,
                createdAt: e.createdAt,
                organisation: { displayName: entry.displayName || null, verified: Boolean(entry.verified) },
            });
        }
    }
    updates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { updates: updates.slice(0, cap), organisations: rows.length, delivery: "pull" };
}
