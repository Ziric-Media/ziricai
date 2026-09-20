/**
 * CORPORATE-P0-1 — production tenant scope boot guard and platform storage health evaluation.
 * Pure functions only; does not mutate process.env.
 */

/**
 * Effective tenant scope mode (matches tenantContext default semantics).
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {"strict"|"lax"}
 */
export function getEffectiveTenantScopeEnforcement(env = process.env) {
    const raw = env.TENANT_SCOPE_ENFORCEMENT;
    if (raw === undefined || raw === null || String(raw).trim() === "") {
        return "lax";
    }
    return String(raw).trim().toLowerCase() === "strict" ? "strict" : "lax";
}

/**
 * Production startup invariant — fail loudly if production is not strict.
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {{ ok: true, mode: "strict" }}
 */
export function validateProductionTenantScopeEnforcement(env = process.env) {
    const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
    const mode = getEffectiveTenantScopeEnforcement(env);

    if (nodeEnv !== "production") {
        return { ok: true, mode };
    }

    if (mode !== "strict") {
        const raw = env.TENANT_SCOPE_ENFORCEMENT;
        const described =
            raw === undefined || raw === null || String(raw).trim() === ""
                ? "missing (defaults to lax)"
                : String(raw);
        throw new Error(
            `Production requires TENANT_SCOPE_ENFORCEMENT=strict (current: ${described}). ` +
                "Set strict on Railway and redeploy. Do not run production with lax tenant scope."
        );
    }

    return { ok: true, mode: "strict" };
}

/**
 * Platform health storage contract for /api/platform/health (not public /api/health).
 * @param {{
 *   nodeEnv?: string|null,
 *   adapterName?: string|null,
 *   storageConfigured?: string|null,
 *   storageFallback?: string|null,
 *   firestoreAdmin?: boolean,
 * }} input
 * @returns {{
 *   storageHealth: "healthy"|"degraded",
 *   platformStatus: "ok"|"degraded",
 *   storageDegradedReasons: string[],
 * }}
 */
export function evaluatePlatformStorageHealth(input) {
    const isProduction = String(input.nodeEnv || "development").trim().toLowerCase() === "production";
    const active = String(input.adapterName || "").trim().toLowerCase();
    const configured = String(input.storageConfigured || "").trim().toLowerCase();
    const fallback = input.storageFallback ? String(input.storageFallback) : null;
    const reasons = [];

    if (isProduction) {
        if (active === "memory") {
            reasons.push("active_storage_is_memory");
        }
        if (fallback) {
            reasons.push("storage_fallback_active");
        }
        if (configured === "firestore" && active !== "firestore") {
            reasons.push("configured_firestore_but_active_adapter_mismatch");
        }
        if (configured === "firestore" && !input.firestoreAdmin) {
            reasons.push("firestore_configured_without_admin_credentials");
        }
    }

    const degraded = reasons.length > 0;
    return {
        storageHealth: degraded ? "degraded" : "healthy",
        platformStatus: degraded ? "degraded" : "ok",
        storageDegradedReasons: reasons,
    };
}
