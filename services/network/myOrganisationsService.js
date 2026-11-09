/**
 * Gate 2 — My Organisations (SUB-01) backend MVP.
 *
 * The consumer's organisations are their SNET-07 relationships (`networkConnections`) joined to the public
 * directory card of each entity (SNET-01b). No second store: following / subscribing / connecting still go through
 * `/api/network/v1/connections`; this service only *reads* the joined view and stores the user's channel
 * preferences on the same relationship document.
 *
 * Privacy: the response carries the public card + the user's own relationship; never `companyId`-keyed business
 * data, never other users. A business-side block shows as `unavailable` (masked), like everywhere else.
 */
import { hydrateBusinessDirectory, getBusinessDirectoryEntry, toDiscoverCard } from "../users/businessDirectoryService.js";
import { getEntityBySnId } from "./networkIdentityService.js";
import { effectivePrefs, listMyOrganisationConnections, setConnectionPreferences } from "./connectionService.js";

export const MY_ORG_SECTIONS = Object.freeze({
    SUBSCRIPTIONS: "subscriptions",
    CONNECTIONS: "connections",
    PENDING: "pending",
    FOLLOWING: "following",
    BLOCKED: "blocked",
    UNAVAILABLE: "unavailable",
});

function sectionFor(state) {
    switch (state) {
        case "subscribed":
            return MY_ORG_SECTIONS.SUBSCRIPTIONS;
        case "connected":
            return MY_ORG_SECTIONS.CONNECTIONS;
        case "connect_requested":
            return MY_ORG_SECTIONS.PENDING;
        case "following":
            return MY_ORG_SECTIONS.FOLLOWING;
        case "blocked":
            return MY_ORG_SECTIONS.BLOCKED;
        default:
            return MY_ORG_SECTIONS.UNAVAILABLE;
    }
}

/**
 * @param {string} uid
 * @returns {Promise<{ organisations: object[], counts: Record<string, number> }>}
 */
export async function listMyOrganisations(uid) {
    const rows = await listMyOrganisationConnections(uid);
    if (rows.some(({ conn }) => !getBusinessDirectoryEntry(conn.companyId))) await hydrateBusinessDirectory();

    const organisations = [];
    for (const { conn, view } of rows) {
        const entry = getBusinessDirectoryEntry(conn.companyId);
        const entity = await getEntityBySnId(conn.snId).catch(() => null);
        const listed = Boolean(entry && entry.discoverability === "public" && entity?.status !== "suspended");
        // A business-side block is masked as "unavailable"; unlisted/suspended orgs stay manageable (unfollow) but show no profile.
        const state = view.state;
        const card = listed ? toDiscoverCard(entry, entity) : null;
        const section = listed || state === "blocked" ? sectionFor(state) : MY_ORG_SECTIONS.UNAVAILABLE;
        organisations.push({
            snId: conn.snId,
            connectionId: conn.connectionId,
            state,
            section,
            available: listed && state !== "unavailable",
            since: view.since,
            updatedAt: view.updatedAt,
            consent: view.consent,
            prefs: effectivePrefs(conn),
            organisation: card
                ? {
                      companyId: card.companyId,
                      displayName: card.displayName,
                      industry: card.industry,
                      location: card.location,
                      verified: card.verified,
                      verification: card.verification,
                      shortDescription: card.shortDescription,
                      categories: card.categories,
                      logoUrl: card.logoUrl,
                      coverUrl: card.coverUrl,
                  }
                : null,
        });
    }

    const counts = {};
    for (const s of Object.values(MY_ORG_SECTIONS)) counts[s] = 0;
    for (const o of organisations) counts[o.section] += 1;
    counts.total = organisations.length;
    return { organisations, counts };
}

/** @param {string} uid @param {string} snId @param {Record<string, boolean>} prefs */
export async function updateMyOrganisationPreferences(uid, snId, prefs) {
    return setConnectionPreferences(uid, snId, prefs);
}
