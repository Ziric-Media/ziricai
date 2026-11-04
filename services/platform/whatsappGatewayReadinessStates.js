/**
 * G6 — WhatsApp Gateway readiness state vocabulary.
 */

export const READINESS_STATE = {
    NOT_CONFIGURED: "NOT_CONFIGURED",
    NOT_REGISTERED: "NOT_REGISTERED",
    AVAILABLE: "AVAILABLE",
    ALLOCATION_REQUIRED: "ALLOCATION_REQUIRED",
    PROJECTION_DRIFT: "PROJECTION_DRIFT",
    CREDENTIALS_UNAVAILABLE: "CREDENTIALS_UNAVAILABLE",
    WEBHOOK_UNVERIFIED: "WEBHOOK_UNVERIFIED",
    ROUTING_UNVERIFIED: "ROUTING_UNVERIFIED",
    SARAH_UNAVAILABLE: "SARAH_UNAVAILABLE",
    OUTBOUND_UNVERIFIED: "OUTBOUND_UNVERIFIED",
    OPERATIONAL: "OPERATIONAL",
    DEGRADED: "DEGRADED",
    SUSPENDED: "SUSPENDED",
};

/** Configuration-only ceiling when no behavioral probe evidence exists. */
export const CONFIGURATION_COMPLETE_STATE = READINESS_STATE.ROUTING_UNVERIFIED;

export const READINESS_DIMENSION = {
    META_REGISTRATION: "meta_registration",
    PLATFORM_CREDENTIALS: "platform_credentials",
    REGISTRY_ALLOCATION: "registry_allocation",
    PROJECTION_CONSISTENCY: "projection_consistency",
    WEBHOOK_INFRASTRUCTURE: "webhook_infrastructure",
    INBOUND_ROUTING: "inbound_routing",
    TENANT_RESOLUTION: "tenant_resolution",
    SARAH_AVAILABILITY: "sarah_availability",
    OUTBOUND_CAPABILITY: "outbound_capability",
    END_TO_END: "end_to_end",
};
