/**
 * SNET-07 — Relationships MVP: how a Sarah App user relates to a network organisation.
 *
 *   discovered → following → subscribed → (connect_requested → connected)      blocked (either side)
 *
 * Principles (SNET-01 §9):
 *   - Discovery never implies a relationship. `discovered` is only recorded on an explicit user action.
 *   - `following` shares nothing and needs no consent.
 *   - `subscribed` and `connected` are consent-linked: they require an active consent grant of the matching scope
 *     for THIS entity. If the grant is later revoked/expired the relationship drops to `following` (lazily, on read).
 *   - A business-side block is invisible to the consumer (they see `unavailable`) and stops new enquiries.
 *   - Businesses see a pseudonymous `connectionId` — never the user's uid or contact details.
 *
 * System of record: `networkConnections/{base64url(uid)}__{snId}`; durable (Firestore) with memory fallback.
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { getEntityBySnId, getOrgEntityByCompanyId } from "./networkIdentityService.js";
import { isValidSnId, snIdKind } from "./snId.js";
import { assertCompanyDiscoverableAsync } from "../users/businessDirectoryService.js";
import { validateConsentGrantAsync } from "../users/consentGrantService.js";

export const CONNECTION_STATES = Object.freeze({
    DISCOVERED: "discovered",
    FOLLOWING: "following",
    SUBSCRIBED: "subscribed",
    CONNECT_REQUESTED: "connect_requested",
    CONNECTED: "connected",
    BLOCKED: "blocked",
});
const S = CONNECTION_STATES;

export const SUBSCRIBE_SCOPE = "sarah_network_subscription";
export const CONNECT_SCOPE = "sarah_network_connection";

export const CONSUMER_ACTIONS = Object.freeze([
    "discover",
    "follow",
    "unfollow",
    "subscribe",
    "unsubscribe",
    "request_connection",
    "cancel_request",
    "disconnect",
    "block",
    "unblock",
]);
export const BUSINESS_ACTIONS = Object.freeze(["accept", "decline", "disconnect", "block", "unblock"]);

const col = createNetworkCollection(NETWORK_COLLECTIONS.CONNECTIONS);
const HISTORY_MAX = 25;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function nowIso() {
    return new Date().toISOString();
}

export function connectionDocId(uid, snId) {
    return `${Buffer.from(String(uid)).toString("base64url")}__${snId}`;
}

function strip(row) {
    if (!row) return null;
    const { __id, ...rest } = row;
    return rest;
}

function transition(conn, to, by, extra = {}) {
    const at = nowIso();
    const history = [...(conn.history || []), { from: conn.state, to, by, at, ...(extra.reason ? { reason: extra.reason } : {}) }].slice(-HISTORY_MAX);
    const { reason, ...fields } = extra;
    return { ...conn, ...fields, state: to, updatedAt: at, history };
}

async function resolveOrg(snId) {
    if (!isValidSnId(snId) || snIdKind(snId) !== "org") throw err(400, "SN_ID_INVALID", "A valid organisation snId is required.");
    const entity = await getEntityBySnId(snId);
    const companyId = entity?.refs?.companyId;
    if (!entity || !companyId) throw err(404, "ENTITY_NOT_FOUND", "Network entity not found.");
    return { entity, companyId };
}

async function load(uid, snId) {
    return strip(await col.get(connectionDocId(uid, snId)));
}

async function save(conn) {
    await col.put(connectionDocId(conn.uid, conn.snId), conn, { merge: false });
    return conn;
}

/** Drop consent-linked states whose grant is no longer usable (revoked / expired / wrong entity). */
async function reconcileConsent(conn) {
    if (![S.SUBSCRIBED, S.CONNECTED, S.CONNECT_REQUESTED].includes(conn.state) || !conn.consentGrantId) return conn;
    try {
        await validateConsentGrantAsync(conn.uid, conn.consentGrantId, { companyId: conn.companyId });
        return conn;
    } catch {
        return save(transition(conn, S.FOLLOWING, "system", { reason: "consent_ended", consentGrantId: null, consentScope: null }));
    }
}

async function requireGrant(uid, grantId, scope, conn) {
    if (!grantId) throw err(403, "GRANT_REQUIRED", "A consent grant is required for this action.");
    const grant = await validateConsentGrantAsync(uid, grantId, { companyId: conn.companyId });
    if (grant.scope !== scope) {
        throw err(403, "GRANT_SCOPE_MISMATCH", `This action needs a grant with scope "${scope}".`);
    }
    if (grant.snId && grant.snId !== conn.snId) throw err(403, "GRANT_COMPANY_MISMATCH", "Consent grant is not valid for this entity.");
    return grant;
}

/** What the consumer sees (business-side blocks are masked). */
export function toConsumerView(conn) {
    if (!conn) return null;
    const maskedBlock = conn.state === S.BLOCKED && conn.blockedBy === "business";
    return {
        connectionId: conn.connectionId,
        snId: conn.snId,
        state: maskedBlock ? "unavailable" : conn.state,
        since: conn.createdAt,
        updatedAt: conn.updatedAt,
        consent: conn.consentGrantId && !maskedBlock ? { grantId: conn.consentGrantId, scope: conn.consentScope } : null,
    };
}

/** What a business sees: pseudonymous. */
export function toBusinessView(conn) {
    return {
        connectionId: conn.connectionId,
        state: conn.state,
        blockedBy: conn.state === S.BLOCKED ? conn.blockedBy || null : undefined,
        since: conn.createdAt,
        updatedAt: conn.updatedAt,
        scope: conn.consentScope || null,
        disclosedFields: conn.disclosedFields || [],
    };
}

/**
 * Consumer status for one entity (`state: "none"` when there is no relationship).
 * @param {string} uid
 * @param {string} snId
 */
export async function getConnectionStatus(uid, snId) {
    await resolveOrg(snId);
    const conn = await load(uid, snId);
    if (!conn) return { snId, state: "none" };
    return toConsumerView(await reconcileConsent(conn));
}

/**
 * Apply a consumer action.
 * @param {string} uid
 * @param {string} snId
 * @param {string} action one of CONSUMER_ACTIONS
 * @param {{ grantId?: string }} [opts]
 */
export async function applyConsumerAction(uid, snId, action, { grantId } = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    if (!CONSUMER_ACTIONS.includes(action)) throw err(422, "CONNECTION_ACTION_INVALID", `Unknown action: ${action}`);
    const { companyId } = await resolveOrg(snId);

    let conn = await load(uid, snId);
    if (conn) conn = await reconcileConsent(conn);

    if (conn?.state === S.BLOCKED) {
        if (conn.blockedBy === "business") throw err(403, "CONNECTION_UNAVAILABLE", "This business is not available to you.");
        if (action === "block") return toConsumerView(conn);
        if (action !== "unblock") throw err(409, "CONNECTION_BLOCKED", "You have blocked this business. Unblock it first.");
    }

    const creating = ["discover", "follow", "subscribe", "request_connection"].includes(action);
    if (creating) await assertCompanyDiscoverableAsync(companyId);

    const fresh = () => {
        const ts = nowIso();
        return {
            connectionId: `conn_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
            uid,
            snId,
            companyId,
            state: null,
            consentGrantId: null,
            consentScope: null,
            disclosedFields: [],
            blockedBy: null,
            history: [],
            schemaVersion: 1,
            createdAt: ts,
            updatedAt: ts,
        };
    };
    const base = conn || fresh();
    const from = conn?.state || null;
    const need = (states, msg) => {
        if (!states.includes(from)) throw err(409, "CONNECTION_STATE_INVALID", msg || `Cannot ${action} from state "${from || "none"}".`);
    };
    const set = (to, extra) => transition(base, to, "consumer", extra);
    const clearConsent = { consentGrantId: null, consentScope: null, disclosedFields: [] };

    let next;
    switch (action) {
        case "discover":
            if (conn) return toConsumerView(conn);
            next = set(S.DISCOVERED);
            break;
        case "follow":
            if ([S.FOLLOWING, S.SUBSCRIBED, S.CONNECT_REQUESTED, S.CONNECTED].includes(from)) return toConsumerView(conn);
            next = set(S.FOLLOWING);
            break;
        case "unfollow":
            need([S.FOLLOWING, S.SUBSCRIBED, S.CONNECT_REQUESTED], from === S.CONNECTED ? "Disconnect before unfollowing." : undefined);
            next = set(S.DISCOVERED, clearConsent);
            break;
        case "subscribe": {
            if ([S.SUBSCRIBED, S.CONNECTED].includes(from)) return toConsumerView(conn);
            const grant = await requireGrant(uid, grantId, SUBSCRIBE_SCOPE, base);
            next = set(S.SUBSCRIBED, { consentGrantId: grant.grantId, consentScope: grant.scope, disclosedFields: grant.disclosedFields || [] });
            break;
        }
        case "unsubscribe":
            need([S.SUBSCRIBED]);
            next = set(S.FOLLOWING, clearConsent);
            break;
        case "request_connection": {
            if ([S.CONNECT_REQUESTED, S.CONNECTED].includes(from)) return toConsumerView(conn);
            const grant = await requireGrant(uid, grantId, CONNECT_SCOPE, base);
            next = set(S.CONNECT_REQUESTED, { consentGrantId: grant.grantId, consentScope: grant.scope, disclosedFields: grant.disclosedFields || [] });
            break;
        }
        case "cancel_request":
            need([S.CONNECT_REQUESTED]);
            next = set(S.FOLLOWING, clearConsent);
            break;
        case "disconnect":
            need([S.CONNECTED]);
            next = set(S.FOLLOWING, clearConsent);
            break;
        case "block":
            next = set(S.BLOCKED, { ...clearConsent, blockedBy: "consumer", priorState: from });
            break;
        case "unblock":
            need([S.BLOCKED]);
            next = set(S.DISCOVERED, { blockedBy: null });
            break;
        default:
            throw err(422, "CONNECTION_ACTION_INVALID", `Unknown action: ${action}`);
    }
    return toConsumerView(await save(next));
}

/** @param {string} uid @param {{ state?: string, limit?: number }} [opts] */
export async function listConnectionsForUser(uid, { state = "", limit = 100 } = {}) {
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: 500 })).map(strip);
    const out = [];
    for (const row of rows) {
        const conn = await reconcileConsent(row);
        const view = toConsumerView(conn);
        if (state && view.state !== state) continue;
        out.push(view);
    }
    out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return out.slice(0, Math.min(Math.max(Number(limit) || 100, 1), 200));
}

export const ORG_PREF_KEYS = Object.freeze(["notifications", "announcements", "reminders"]);

/** Effective My Organisations preferences (all channels on until the user turns one off). */
export function effectivePrefs(conn) {
    const stored = conn?.prefs && typeof conn.prefs === "object" ? conn.prefs : {};
    return Object.fromEntries(ORG_PREF_KEYS.map((k) => [k, stored[k] === undefined ? true : Boolean(stored[k])]));
}

/**
 * Gate 2 — server-internal rows for My Organisations (includes `companyId`; never return these to a business).
 * Consent-reconciled; business-side blocks are masked as `unavailable`; pure `discovered` rows are not "mine".
 * @param {string} uid
 */
export async function listMyOrganisationConnections(uid, { limit = 200 } = {}) {
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: 500 })).map(strip);
    const out = [];
    for (const row of rows) {
        const conn = await reconcileConsent(row);
        if (conn.state === S.DISCOVERED) continue;
        out.push({ conn, view: toConsumerView(conn) });
    }
    out.sort((a, b) => String(b.conn.updatedAt).localeCompare(String(a.conn.updatedAt)));
    return out.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 200));
}

/**
 * Gate 2 — channel preferences for an existing relationship (My Organisations → Manage).
 * Preferences are the user's own and do not change consent; delivery (SNET-07 gap) honours them when it ships.
 * @param {string} uid
 * @param {string} snId
 * @param {Record<string, unknown>} patch subset of ORG_PREF_KEYS (booleans)
 */
export async function setConnectionPreferences(uid, snId, patch = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    if (!isValidSnId(snId) || snIdKind(snId) !== "org") throw err(400, "SN_ID_INVALID", "A valid organisation snId is required.");
    const unknown = Object.keys(patch || {}).filter((k) => !ORG_PREF_KEYS.includes(k));
    if (unknown.length) throw err(422, "PREFS_INVALID", `Unknown preference: ${unknown.join(", ")}`);
    for (const k of Object.keys(patch)) {
        if (typeof patch[k] !== "boolean") throw err(422, "PREFS_INVALID", `Preference "${k}" must be true or false.`);
    }
    const conn = await load(uid, snId);
    if (!conn || conn.state === S.DISCOVERED) throw err(404, "CONNECTION_NOT_FOUND", "You have no relationship with this organisation.");
    if (conn.state === S.BLOCKED) {
        throw err(conn.blockedBy === "business" ? 403 : 409, conn.blockedBy === "business" ? "CONNECTION_UNAVAILABLE" : "CONNECTION_BLOCKED",
            conn.blockedBy === "business" ? "This business is not available to you." : "You have blocked this business.");
    }
    const next = { ...conn, prefs: { ...effectivePrefs(conn), ...patch }, updatedAt: nowIso() };
    await save(next);
    return { snId, prefs: effectivePrefs(next) };
}

/**
 * Gate 5 — audience size for a subscriber notification (counts only; never uids). Subscribers = subscribed or
 * connected relationships whose consent is still valid; `byChannel` honours each user's My Organisations prefs.
 * @param {string} companyId
 */
export async function countSubscribersForOrg(companyId) {
    const byChannel = Object.fromEntries(ORG_PREF_KEYS.map((k) => [k, 0]));
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) return { subscribers: 0, byChannel, snId: null };
    const rows = (await col.list({ where: [["snId", "==", entity.snId]], limit: 5000 })).map(strip);
    let subscribers = 0;
    for (const row of rows) {
        const conn = await reconcileConsent(row);
        if (![S.SUBSCRIBED, S.CONNECTED].includes(conn.state)) continue;
        subscribers += 1;
        const prefs = effectivePrefs(conn);
        for (const k of ORG_PREF_KEYS) if (prefs[k]) byChannel[k] += 1;
    }
    return { subscribers, byChannel, snId: entity.snId };
}

/** Business-side list (pseudonymous). @param {string} companyId */
export async function listConnectionsForOrg(companyId, { state = "", limit = 100 } = {}) {
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) return [];
    const rows = (await col.list({ where: [["snId", "==", entity.snId]], limit: 500 })).map(strip);
    const out = [];
    for (const row of rows) {
        const conn = await reconcileConsent(row);
        if (state && conn.state !== state) continue;
        out.push(toBusinessView(conn));
    }
    out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return out.slice(0, Math.min(Math.max(Number(limit) || 100, 1), 200));
}

/**
 * Apply a business-side action to one of ITS OWN connections.
 * @param {string} companyId
 * @param {string} connectionId
 * @param {string} action one of BUSINESS_ACTIONS
 */
export async function applyBusinessAction(companyId, connectionId, action, actor = "business") {
    if (!BUSINESS_ACTIONS.includes(action)) throw err(422, "CONNECTION_ACTION_INVALID", `Unknown action: ${action}`);
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) throw err(404, "CONNECTION_NOT_FOUND", "Connection not found.");
    const rows = (await col.list({ where: [["snId", "==", entity.snId]], limit: 500 })).map(strip);
    const found = rows.find((r) => r.connectionId === connectionId);
    if (!found) throw err(404, "CONNECTION_NOT_FOUND", "Connection not found.");
    const conn = await reconcileConsent(found);
    const need = (states) => {
        if (!states.includes(conn.state)) throw err(409, "CONNECTION_STATE_INVALID", `Cannot ${action} from state "${conn.state}".`);
    };
    const clear = { consentGrantId: null, consentScope: null, disclosedFields: [] };
    let next;
    switch (action) {
        case "accept":
            need([S.CONNECT_REQUESTED]);
            next = transition(conn, S.CONNECTED, actor);
            break;
        case "decline":
            need([S.CONNECT_REQUESTED]);
            next = transition(conn, S.FOLLOWING, actor, { ...clear, reason: "declined" });
            break;
        case "disconnect":
            need([S.CONNECTED]);
            next = transition(conn, S.FOLLOWING, actor, { ...clear, reason: "business_disconnected" });
            break;
        case "block":
            if (conn.state === S.BLOCKED && conn.blockedBy === "business") return toBusinessView(conn);
            next = transition(conn, S.BLOCKED, actor, { ...clear, blockedBy: "business", priorState: conn.state });
            break;
        case "unblock":
            need([S.BLOCKED]);
            if (conn.blockedBy !== "business") throw err(409, "CONNECTION_STATE_INVALID", "This connection was blocked by the user.");
            next = transition(conn, S.DISCOVERED, actor, { blockedBy: null });
            break;
        default:
            throw err(422, "CONNECTION_ACTION_INVALID", `Unknown action: ${action}`);
    }
    return toBusinessView(await save(next));
}

/** Platform stats: relationship counts by state (no uids). Capped scan. */
export async function countConnectionsByState({ limit = 5000 } = {}) {
    const rows = await col.list({ limit });
    const byState = {};
    for (const r of rows) byState[r.state] = (byState[r.state] || 0) + 1;
    return { total: rows.length, byState, truncated: rows.length >= limit };
}

/** True when the business has blocked this user. Used by the enquiry path. */
export async function isBlockedByBusiness(uid, companyId) {
    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) return false;
    const conn = await load(uid, entity.snId);
    return Boolean(conn && conn.state === S.BLOCKED && conn.blockedBy === "business");
}

export async function assertNotBlockedByBusiness(uid, companyId) {
    if (await isBlockedByBusiness(uid, companyId)) {
        throw err(403, "CONNECTION_UNAVAILABLE", "This business is not available to you.");
    }
}

export function clearNetworkConnectionsForTests() {
    col.clearMemory();
}
