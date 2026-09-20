/**
 * CORPORATE-P0-2c — honest onboarding integration/training state labels.
 */

/** @typedef {'connected'|'pending'|'simulated'|'failed'|'unconfigured'} WhatsAppOnboardingState */
/** @typedef {'complete'|'simulated'|'pending'|'failed'|'unconfigured'} TrainingOnboardingState */

/**
 * @param {{ configured?: boolean, simulate?: boolean }} platformWa
 * @param {{ status?: string, simulated?: boolean }|null|undefined} tenantIntegration
 * @returns {{ state: WhatsAppOnboardingState, connected: boolean, simulated: boolean, pending: boolean }}
 */
export function resolveWhatsAppOnboardingState(platformWa = {}, tenantIntegration = null) {
    const platformConfigured = Boolean(platformWa.configured);
    const intSim = Boolean(tenantIntegration?.simulated);
    const intStatus = String(tenantIntegration?.status || "").toLowerCase();

    if (intStatus === "failed") {
        return { state: "failed", connected: false, simulated: false, pending: false };
    }

    if (intStatus === "connected" && !intSim && platformConfigured) {
        return { state: "connected", connected: true, simulated: false, pending: false };
    }

    if (intStatus === "simulated" || platformWa.simulate || !platformConfigured) {
        return { state: "simulated", connected: false, simulated: true, pending: false };
    }

    if (intStatus === "pending" || platformConfigured) {
        return { state: "pending", connected: false, simulated: false, pending: true };
    }

    return { state: "unconfigured", connected: false, simulated: false, pending: false };
}

/**
 * Onboarding train step — no fabricated embedding job in P0-2c.
 * @param {{ knowledgeItemCount?: number }} [ctx]
 */
export function buildHonestTrainingStepResult(ctx = {}) {
    const count = ctx.knowledgeItemCount || 0;
    return {
        state: "simulated",
        status: "knowledge_setup_complete",
        simulated: true,
        connected: false,
        knowledgeItemCount: count,
        message:
            count > 0
                ? "Knowledge saved for your AI employee. No separate training job ran in this onboarding step."
                : "Knowledge setup step complete. Add documents or FAQs to enrich answers.",
    };
}

/**
 * @param {{ placeholder?: boolean }} [meta]
 */
export function buildHonestWebsiteImportResult(meta = {}) {
    return {
        state: "simulated",
        status: "placeholder_only",
        simulated: true,
        placeholder: Boolean(meta.placeholder),
        message: "Website import is not a live crawl in onboarding. Add content manually or use Portal uploads.",
    };
}
