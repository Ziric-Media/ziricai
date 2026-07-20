/**
 * Unified onboarding completion — atomic signup → live platform chain.
 */
import { getWorkspaceSnapshot } from "../portal/workspaceService.js";
import { getTenantBilling } from "../payments/billingService.js";
import { listAiEmployees } from "../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";
import { getPlatformCompany, getPlatformRegistryActivity } from "./platformRegistry.js";
import { finalizeTenantOnboarding } from "./tenantBootstrap.js";
import { portalUrlForCompany } from "../core/siteUrls.js";
import {
    startOnboarding,
    completeOnboardingStep,
    getOnboardingSession,
    ONBOARDING_STEPS,
} from "./onboardingService.js";

/**
 * One-shot onboarding: account → industry → whatsapp → knowledge → train → test → complete.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function completeOnboarding(payload = {}) {
    const {
        companyName,
        ownerName,
        ownerEmail,
        uid,
        industryId,
        faqText,
        websiteUrl,
        branding,
        settings,
        skipOptionalSteps = false,
    } = payload;

    if (!companyName?.trim()) throw new Error("companyName is required");
    if (!ownerEmail?.trim()) throw new Error("ownerEmail is required");
    if (!ownerName?.trim()) throw new Error("ownerName is required");

    const start = await startOnboarding({
        companyName,
        ownerName,
        ownerEmail,
        uid: uid || `owner-${Date.now()}`,
    });

    const { sessionId, companyId } = start;

    if (industryId) {
        await completeOnboardingStep(sessionId, "industry", { industryId });
    } else if (!skipOptionalSteps) {
        await completeOnboardingStep(sessionId, "industry", { industryId: "retail" });
    }

    await completeOnboardingStep(sessionId, "whatsapp", {});

    if (faqText || websiteUrl || !skipOptionalSteps) {
        await completeOnboardingStep(sessionId, "knowledge", {
            faqText: faqText || "",
            websiteUrl: websiteUrl || "",
        });
    }

    await completeOnboardingStep(sessionId, "train", {});
    await completeOnboardingStep(sessionId, "test", {});

    await completeOnboardingStep(sessionId, "complete", {
        branding,
        settings,
        seedDemoLead: payload.seedDemoLead !== false,
    });

    const session = getOnboardingSession(sessionId);
    return gatherOnboardingResult(companyId, {
        sessionId,
        session,
        portalUrl: start.portalUrl,
        plan: start.plan,
    });
}

/**
 * Collect workspace snapshot + verification payload (no side effects).
 * @param {string} companyId
 * @param {object} [context]
 */
export async function gatherOnboardingResult(companyId, context = {}) {
    const [workspaceSnapshot, billing, agents, knowledgeDocs, platformRecord] = await Promise.all([
        getWorkspaceSnapshot(companyId),
        getTenantBilling(companyId),
        listAiEmployees(companyId),
        listKnowledgeDocuments(companyId),
        Promise.resolve(getPlatformCompany(companyId)),
    ]);

    const session = context.session || {};
    const portalUrl =
        context.portalUrl ||
        session.portalUrl ||
        portalUrlForCompany(companyId);

    return {
        success: true,
        sessionId: context.sessionId || null,
        companyId,
        portalUrl,
        plan: context.plan || session.plan || billing?.planId || "trial",
        workspaceSnapshot,
        workspace: workspaceSnapshot,
        billing,
        agents,
        knowledgeCount: knowledgeDocs.length,
        platformRecord,
        completedSteps: session.completedSteps || [...ONBOARDING_STEPS],
        sarahContext: {
            companyId,
            companyName: workspaceSnapshot?.company?.name || platformRecord?.name,
            agentCount: agents.length,
            kbSummary: {
                documentCount: knowledgeDocs.length,
                titles: knowledgeDocs.slice(0, 5).map((d) => d.title),
            },
        },
    };
}

/** @deprecated use gatherOnboardingResult — finalize runs in onboarding complete step */
export async function buildOnboardingResult(companyId, context = {}) {
    await finalizeTenantOnboarding(companyId, {
        ownerName: context.ownerName,
        industry: context.session?.industry,
        industryId: context.session?.industryId,
        whatsappConnected: context.session?.whatsappConnected ?? true,
        seedDemoLead: context.seedDemoLead !== false,
        onboardingCompletedAt: context.session?.completedAt || new Date().toISOString(),
    });
    return gatherOnboardingResult(companyId, context);
}

export { getPlatformRegistryActivity };
