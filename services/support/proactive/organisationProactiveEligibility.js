/**
 * PI-4F-6 — Which organisations participate in proactive customer-health detection.
 */

export const ORGANISATION_ENVIRONMENT = {
    PRODUCTION: "production",
    PILOT: "pilot",
    TEST: "test",
    GATE: "gate",
};

const NON_MONITOR_ENVIRONMENTS = new Set([
    ORGANISATION_ENVIRONMENT.TEST,
    ORGANISATION_ENVIRONMENT.GATE,
]);

/**
 * Legacy bootstrap: infer gate/test environment from naming when fields are unset.
 * Centralised here — not duplicated in individual detection rules.
 */
export function inferLegacyEnvironment(company) {
    if (company?.environment) return null;
    const id = String(company?.id || "").toLowerCase();
    const name = String(company?.name || "").toLowerCase();
    const blob = `${id} ${name}`;
    if (/^p0-\d|p0-\d-final|corporate-p0|prestage|smoke-evidence/.test(blob)) {
        return ORGANISATION_ENVIRONMENT.GATE;
    }
    if (/registry-test|e2e-|embed-signup-test|gate-test|acceptance-test/.test(blob)) {
        return ORGANISATION_ENVIRONMENT.TEST;
    }
    return null;
}

export function resolveOrganisationEnvironment(company) {
    const explicit = String(company?.environment || "").toLowerCase();
    if (Object.values(ORGANISATION_ENVIRONMENT).includes(explicit)) {
        return explicit;
    }
    return inferLegacyEnvironment(company) || ORGANISATION_ENVIRONMENT.PRODUCTION;
}

/**
 * @param {object|null|undefined} company
 * @returns {boolean}
 */
export function isProactiveMonitoringEnabled(company) {
    if (!company?.id) return false;

    if (company.proactiveMonitoring === true) return true;
    if (company.proactiveMonitoring === false) return false;

    const env = resolveOrganisationEnvironment(company);
    if (NON_MONITOR_ENVIRONMENTS.has(env)) return false;

    return true;
}

export function proactiveEligibilitySummary(company) {
    return {
        companyId: company?.id,
        environment: resolveOrganisationEnvironment(company),
        proactiveMonitoring: isProactiveMonitoringEnabled(company),
        inferred: !company?.environment && Boolean(inferLegacyEnvironment(company)),
    };
}
