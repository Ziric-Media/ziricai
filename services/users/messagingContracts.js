/**
 * CH1 — Chat messaging foundation (types, participants, handover placeholder).
 * @see docs/architecture/SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md §3.2–3.3
 */

export const CHAT_SCHEMA_VERSION = 1;

/** @typedef {import("./identityContracts.js").PersonId} PersonId */

/** @enum {string} */
export const CONVERSATION_TYPES = {
    PERSON_TO_PERSON: "person_to_person",
    PERSON_TO_BUSINESS: "person_to_business",
    PERSON_TO_ORGANISATION: "person_to_organisation",
    PERSON_TO_SARAH: "person_to_sarah",
    GROUP_PERSONAL: "group_personal",
    GROUP_ORGANISATION: "group_organisation",
    AI_TO_AI: "ai_to_ai",
    HUMAN_ASSISTED: "human_assisted",
};

/** CH6 will drive transitions; CH1 stores the field only. */
export const HANDOVER_STATES = {
    AI_ACTIVE: "ai_active",
    HUMAN_REQUESTED: "human_requested",
    AWAITING_ASSIGNMENT: "awaiting_assignment",
    HUMAN_ASSIGNED: "human_assigned",
    HUMAN_ACTIVE: "human_active",
    AI_RESUME_PENDING: "ai_resume_pending",
    AI_ACTIVE_AGAIN: "ai_active_again",
    RESOLVED: "resolved",
    CLOSED: "closed",
};

export const PARTICIPANT_KINDS = {
    PERSON: "person",
    COMPANY_SARAH: "company_sarah",
    PERSONAL_SARAH: "personal_sarah",
    EMPLOYEE: "employee",
    SYSTEM: "system",
};

/** Consumer message roles (tenant mirror may use source). */
export const MESSAGE_ROLES = {
    USER: "user",
    ASSISTANT: "assistant",
    SYSTEM: "system",
    HUMAN: "human",
};

const CONVERSATION_TYPE_SET = new Set(Object.values(CONVERSATION_TYPES));
const HANDOVER_STATE_SET = new Set(Object.values(HANDOVER_STATES));
const PARTICIPANT_KIND_SET = new Set(Object.values(PARTICIPANT_KINDS));
const MESSAGE_ROLE_SET = new Set(Object.values(MESSAGE_ROLES));

/**
 * @typedef {object} ChatParticipant
 * @property {string} id Stable participant id (personId, sarah agent id, employee id, …).
 * @property {keyof typeof PARTICIPANT_KINDS | string} kind
 * @property {boolean} [invited] D1 — explicit Sarah invite into thread.
 * @property {boolean} [consentGranted]
 * @property {string|null} [displayName]
 * @property {string|null} [sarahAgentId] When kind is company_sarah | personal_sarah.
 * @property {string|null} [employeeId] When kind is employee.
 */

/**
 * @typedef {object} UserConversationRecord
 * @property {number} schemaVersion
 * @property {string} type CONVERSATION_TYPES value
 * @property {ChatParticipant[]} participants
 * @property {string} ownershipState HANDOVER_STATES value (CH6 placeholder)
 * @property {string|null} [assignedEmployeeId]
 * @property {string|null} [companySarahAgentId]
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidConversationType(value) {
    return CONVERSATION_TYPE_SET.has(String(value || ""));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidHandoverState(value) {
    return HANDOVER_STATE_SET.has(String(value || ""));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidMessageRole(value) {
    return MESSAGE_ROLE_SET.has(String(value || ""));
}

/**
 * @param {unknown} participant
 * @returns {participant is ChatParticipant}
 */
export function isValidParticipant(participant) {
    if (!participant || typeof participant !== "object") return false;
    const p = /** @type {ChatParticipant} */ (participant);
    return (
        typeof p.id === "string" &&
        p.id.length > 0 &&
        PARTICIPANT_KIND_SET.has(String(p.kind || ""))
    );
}

/**
 * @param {ChatParticipant[]} participants
 */
export function normalizeParticipants(participants) {
    if (!Array.isArray(participants)) return [];
    return participants.filter(isValidParticipant).map((p) => ({
        id: p.id,
        kind: p.kind,
        invited: Boolean(p.invited),
        consentGranted: p.consentGranted !== false,
        displayName: p.displayName ?? null,
        sarahAgentId: p.sarahAgentId ?? null,
        employeeId: p.employeeId ?? null,
    }));
}

/**
 * Default participants for consumer ↔ Company Sarah (`person_to_business`).
 * @param {PersonId} personId
 * @param {string} companyId
 * @param {object} [options]
 * @param {string|null} [options.personDisplayName]
 * @param {string|null} [options.companyDisplayName]
 * @param {string|null} [options.sarahAgentId]
 */
export function buildPersonToBusinessParticipants(personId, companyId, options = {}) {
    const sarahAgentId = options.sarahAgentId || `company_sarah:${companyId}`;
    /** @type {ChatParticipant[]} */
    const participants = [
        {
            id: personId,
            kind: PARTICIPANT_KINDS.PERSON,
            displayName: options.personDisplayName ?? null,
            invited: false,
            consentGranted: true,
            sarahAgentId: null,
            employeeId: null,
        },
        {
            id: sarahAgentId,
            kind: PARTICIPANT_KINDS.COMPANY_SARAH,
            displayName: options.companyDisplayName ? `${options.companyDisplayName} Sarah` : "Company Sarah",
            invited: false,
            consentGranted: true,
            sarahAgentId,
            employeeId: null,
        },
    ];
    return normalizeParticipants(participants);
}

/**
 * @param {PersonId} personId
 * @param {string} companyId
 * @param {object} [options]
 */
export function buildPersonToBusinessConversationMeta(personId, companyId, options = {}) {
    const sarahAgentId = options.sarahAgentId || `company_sarah:${companyId}`;
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        type: CONVERSATION_TYPES.PERSON_TO_BUSINESS,
        participants: buildPersonToBusinessParticipants(personId, companyId, {
            ...options,
            sarahAgentId,
        }),
        ownershipState: HANDOVER_STATES.AI_ACTIVE,
        assignedEmployeeId: null,
        companySarahAgentId: sarahAgentId,
    };
}

/**
 * Merge CH1 fields onto an existing conversation record (idempotent).
 * @param {object} conv
 * @param {object} [options]
 */
/**
 * Stable P2P thread id for two personIds (order-independent).
 * @param {PersonId} personA
 * @param {PersonId} personB
 */
export function buildPersonToPersonConversationId(personA, personB) {
    const [a, b] = [String(personA), String(personB)].sort();
    const raw = `uc_p2p_${a}_${b}`;
    return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

/**
 * @param {PersonId} personA
 * @param {PersonId} personB
 * @param {object} [options]
 */
export function buildPersonToPersonParticipants(personA, personB, options = {}) {
    const names = options.displayNames || {};
    /** @type {ChatParticipant[]} */
    const participants = [
        {
            id: personA,
            kind: PARTICIPANT_KINDS.PERSON,
            displayName: names[personA] ?? null,
            invited: false,
            consentGranted: true,
            sarahAgentId: null,
            employeeId: null,
        },
        {
            id: personB,
            kind: PARTICIPANT_KINDS.PERSON,
            displayName: names[personB] ?? null,
            invited: false,
            consentGranted: true,
            sarahAgentId: null,
            employeeId: null,
        },
    ];
    return normalizeParticipants(participants);
}

/**
 * @param {PersonId} personA
 * @param {PersonId} personB
 * @param {object} [options]
 */
export function buildPersonToPersonConversationMeta(personA, personB, options = {}) {
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        type: CONVERSATION_TYPES.PERSON_TO_PERSON,
        participants: buildPersonToPersonParticipants(personA, personB, options),
        ownershipState: HANDOVER_STATES.AI_ACTIVE,
        assignedEmployeeId: null,
        companySarahAgentId: null,
        peerPersonId: personA === options.viewerPersonId ? personB : personA,
    };
}

/**
 * @param {string} title
 * @param {PersonId} ownerId
 * @param {PersonId[]} memberIds
 * @param {object} [options]
 */
export function buildGroupPersonalConversationMeta(title, ownerId, memberIds, options = {}) {
    const unique = [...new Set([ownerId, ...memberIds].filter(Boolean))];
    /** @type {ChatParticipant[]} */
    const participants = unique.map((id) => ({
        id,
        kind: PARTICIPANT_KINDS.PERSON,
        displayName: options.displayNames?.[id] ?? null,
        invited: id !== ownerId,
        consentGranted: true,
        sarahAgentId: null,
        employeeId: null,
    }));
    if (options.personalSarahInvited) {
        participants.push({
            id: `personal_sarah:${ownerId}`,
            kind: PARTICIPANT_KINDS.PERSONAL_SARAH,
            displayName: "Personal Sarah",
            invited: true,
            consentGranted: Boolean(options.personalSarahConsent),
            sarahAgentId: `personal_sarah:${ownerId}`,
            employeeId: null,
        });
    }
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        type: CONVERSATION_TYPES.GROUP_PERSONAL,
        title: String(title || "Group").slice(0, 120),
        participants: normalizeParticipants(participants),
        ownershipState: HANDOVER_STATES.AI_ACTIVE,
        assignedEmployeeId: null,
        companySarahAgentId: null,
        ownerId,
    };
}

/**
 * Sarah Network AI-to-AI enquiry thread (consumer-visible).
 * @param {PersonId} personId
 * @param {string} companyId
 * @param {string} networkRequestId
 * @param {object} [options]
 */
export function buildAiToAiConversationMeta(personId, companyId, networkRequestId, options = {}) {
    const sarahAgentId = options.sarahAgentId || `company_sarah:${companyId}`;
    return {
        schemaVersion: CHAT_SCHEMA_VERSION,
        type: CONVERSATION_TYPES.AI_TO_AI,
        networkRequestId,
        companyId,
        participants: normalizeParticipants([
            {
                id: personId,
                kind: PARTICIPANT_KINDS.PERSON,
                displayName: options.personDisplayName ?? null,
                invited: false,
                consentGranted: true,
                sarahAgentId: null,
                employeeId: null,
            },
            {
                id: `personal_sarah:${personId}`,
                kind: PARTICIPANT_KINDS.PERSONAL_SARAH,
                displayName: "Personal Sarah",
                invited: false,
                consentGranted: true,
                sarahAgentId: `personal_sarah:${personId}`,
                employeeId: null,
            },
            {
                id: sarahAgentId,
                kind: PARTICIPANT_KINDS.COMPANY_SARAH,
                displayName: options.companyDisplayName ? `${options.companyDisplayName} Sarah` : "Company Sarah",
                invited: false,
                consentGranted: true,
                sarahAgentId,
                employeeId: null,
            },
        ]),
        ownershipState: HANDOVER_STATES.AI_ACTIVE,
        assignedEmployeeId: null,
        companySarahAgentId: sarahAgentId,
    };
}

export function ensureConversationMessagingFoundation(conv, options = {}) {
    const personId = conv.personId || conv.userId;
    const companyId = conv.companyId;
    if (!personId || !companyId) return conv;

    const base = buildPersonToBusinessConversationMeta(personId, companyId, {
        personDisplayName: conv.consumerDisplayName || options.personDisplayName,
        companyDisplayName: conv.companyName || options.companyDisplayName,
        sarahAgentId: conv.companySarahAgentId || options.sarahAgentId,
    });

    const merged = {
        ...conv,
        schemaVersion: conv.schemaVersion || base.schemaVersion,
        type: conv.type || base.type,
        ownershipState: conv.ownershipState || base.ownershipState,
        assignedEmployeeId: conv.assignedEmployeeId ?? base.assignedEmployeeId,
        companySarahAgentId: conv.companySarahAgentId || base.companySarahAgentId,
        participants: normalizeParticipants(conv.participants?.length ? conv.participants : base.participants),
    };
    return merged;
}
