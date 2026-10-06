/**
 * PI-4F-6 — WhatsApp proactive signal classification (credential vs configuration).
 */

/** True only for explicit authentication / token failure evidence — not missing setup fields. */
export function isActualCredentialFailure(lastError) {
    const t = String(lastError || "").toLowerCase().trim();
    if (!t) return false;
    if (/\b401\b|\b403\b/.test(t)) return true;
    return (
        /token expired|expired token|revoked token|invalid access token|invalid oauth|oauth.*(fail|error)|authentication (fail|error)|auth (fail|error)|invalid credentials|access token.*invalid|session has expired/.test(
            t
        )
    );
}

export function isWhatsAppSetupIncomplete(wa) {
    if (!wa?.present) return true;
    const missing = wa.missing || [];
    const missingSource = missing.some((m) => String(m).toLowerCase() === "credentialssource");
    if (missingSource && !wa.runtimeReady && !isActualCredentialFailure(wa.lastError)) {
        return true;
    }
    if (!wa.runtimeReady && missing.length > 0 && !isActualCredentialFailure(wa.lastError)) {
        return true;
    }
    return false;
}

/**
 * Integrations board "error" bucket — only counts as credential signal with auth evidence.
 */
export function integrationBoardCredentialFailure(integrationError, wa) {
    if (!integrationError || !wa?.present) return false;
    return isActualCredentialFailure(wa.lastError);
}
