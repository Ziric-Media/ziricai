/**
 * C1 — Sarah App integration identity contracts (personId, conversationId, messageId).
 * @see docs/architecture/COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md
 */

/** @typedef {string} PersonId Registered consumer; C1 personId === Firebase Auth uid. */

/** @typedef {string} ConsumerConversationId Stable consumer thread id (`uc_{companyId}_{personId}`). */

/** @typedef {string} ConsumerMessageId UUID (or validated client-supplied id). */

const FIREBASE_UID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONVERSATION_ID_MAX = 180;

/**
 * C1: personId is the Firebase Auth uid for registered consumers.
 * @param {string} uid
 * @returns {PersonId}
 */
export function personIdFromUserId(uid) {
    return String(uid || "").trim();
}

/**
 * @param {unknown} value
 * @returns {value is PersonId}
 */
export function isValidPersonId(value) {
    const s = String(value || "");
    return s.length > 0 && s.length <= 128 && FIREBASE_UID_RE.test(s);
}

/**
 * Same algorithm as legacy `buildConversationId` in userConversationService.
 * @param {PersonId} personId
 * @param {string} companyId
 * @returns {ConsumerConversationId}
 */
export function buildConsumerConversationId(personId, companyId) {
    return `uc_${companyId}_${personId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, CONVERSATION_ID_MAX);
}

/**
 * @param {unknown} value
 * @returns {value is ConsumerConversationId}
 */
export function isValidConsumerConversationId(value) {
    const s = String(value || "");
    return s.startsWith("uc_") && s.length <= CONVERSATION_ID_MAX && /^[a-zA-Z0-9_-]+$/.test(s);
}

/**
 * @param {unknown} value
 * @returns {value is ConsumerMessageId}
 */
export function isValidConsumerMessageId(value) {
    return UUID_RE.test(String(value || ""));
}

/**
 * @typedef {object} UserConversationMetadata
 * @property {ConsumerConversationId} id
 * @property {PersonId} personId
 * @property {PersonId} userId
 * @property {string} companyId
 * @property {string} channel
 * @property {string|null} [tenantConversationId]
 * @property {string|null} [tenantCustomerId]
 * @property {string} lastMessageAt
 * @property {string} preview
 * @property {string} createdAt
 */

/**
 * @typedef {object} UserConversationMessage
 * @property {ConsumerMessageId} id
 * @property {ConsumerConversationId} conversationId
 * @property {"user"|"assistant"|"system"} role
 * @property {string} content
 * @property {string|null} [source]
 * @property {string} createdAt
 * @property {string|null} [tenantMessageId]
 */
