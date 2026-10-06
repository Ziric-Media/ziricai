/**
 * Sarah persona + tool policy — explicit separation of public, client, and platform operators.
 */

export const SARAH_PERSONA = {
    CLIENT_OPERATOR: "CLIENT_OPERATOR",
    PLATFORM_OPERATOR: "PLATFORM_OPERATOR",
    PUBLIC_RECEPTION: "PUBLIC_RECEPTION",
};

export const SARAH_TOOL_POLICY = {
    PUBLIC: "publicTools",
    TENANT: "tenantTools",
    TENANT_AND_PLATFORM: "tenantToolsAndPlatformTools",
};

/** Tools allowed on marketing / unauthenticated landing Sarah. */
export const PUBLIC_SARAH_TOOL_NAMES = new Set(["platformHelp", "searchCompanyKnowledge"]);

/**
 * @param {string} [surface] portal | mission_control | landing
 * @returns {typeof SARAH_PERSONA[keyof typeof SARAH_PERSONA]}
 */
export function resolvePersonaFromSurface(surface) {
    const s = String(surface || "portal").toLowerCase();
    if (s === "landing") return SARAH_PERSONA.PUBLIC_RECEPTION;
    if (s === "mission_control") return SARAH_PERSONA.PLATFORM_OPERATOR;
    return SARAH_PERSONA.CLIENT_OPERATOR;
}

/**
 * @param {string} persona
 * @returns {typeof SARAH_TOOL_POLICY[keyof typeof SARAH_TOOL_POLICY]}
 */
export function toolPolicyForPersona(persona) {
    if (persona === SARAH_PERSONA.PUBLIC_RECEPTION) return SARAH_TOOL_POLICY.PUBLIC;
    if (persona === SARAH_PERSONA.PLATFORM_OPERATOR) return SARAH_TOOL_POLICY.TENANT_AND_PLATFORM;
    return SARAH_TOOL_POLICY.TENANT;
}

export function resolveLandingSarahCompanyId() {
    return (
        process.env.LANDING_SARAH_COMPANY_ID ||
        process.env.PUBLIC_SARAH_COMPANY_ID ||
        "ziricai"
    );
}
