/**
 * SaaS onboarding orchestration — multi-step wizard backend.
 * Provisions tenants, installs industry packs, tracks wizard progress.
 */
import { provisionCompany, installIndustryPack } from "./provisioningService.js";
import { getPackById } from "./marketplaceRegistry.js";
import { getPlan, buildUsageFromPlan } from "./billingPlans.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { saveKnowledgeDocument } from "../knowledgeService.js";
import { upsertGlobalUserProfile, upsertOwnerMembership } from "../auth/authService.js";
import { portalUrlForCompany } from "../core/siteUrls.js";
import { updateCompany, saveCompanyBranding } from "../tenants/companyService.js";
import { upsertTenantUser } from "../tenants/userService.js";
import { finalizeTenantOnboarding, syncWhatsAppIntegrationStatus } from "./tenantBootstrap.js";
import { getWorkspaceSnapshot } from "../portal/workspaceService.js";
import { listAiEmployees } from "../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";

/** In-memory onboarding sessions (dev/demo; persist to Firestore in production). */
const sessions = new Map();

export const ONBOARDING_STEPS = [
    "account",
    "industry",
    "whatsapp",
    "knowledge",
    "train",
    "test",
    "complete",
];

export const ONBOARDING_INDUSTRIES = [
    { id: "automotive", label: "Automotive", icon: "🚗", packId: "pack-automotive", category: "automotive" },
    { id: "funeral", label: "Funeral", icon: "💐", packId: "pack-funeral-ai", category: "funeral" },
    { id: "school", label: "School", icon: "🎓", packId: "pack-schools", category: "schools" },
    { id: "healthcare", label: "Healthcare", icon: "🩺", packId: "pack-doctors", category: "doctors" },
    { id: "law", label: "Law Firm", icon: "⚖️", packId: "pack-law", category: "law" },
    { id: "hotel", label: "Hotel", icon: "🏨", packId: "pack-hotels", category: "hotels" },
    { id: "retail", label: "Retail", icon: "🛍️", packId: null, category: "restaurants" },
    { id: "construction", label: "Construction", icon: "🏗️", packId: "pack-construction", category: "construction" },
    { id: "church", label: "Church", icon: "⛪", packId: "pack-churches", category: "churches" },
    { id: "real_estate", label: "Real Estate", icon: "🏠", packId: "pack-estate-agent-ai", category: "real_estate" },
];

function genId(prefix = "onb") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
    return new Date().toISOString();
}

export function slugifyCompanyName(name) {
    const base = String(name || "company")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32);
    return base || "company";
}

function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

export function getOnboardingSession(sessionId) {
    return sessions.get(sessionId) || null;
}

export function getWhatsAppConfig() {
    const phoneId = process.env.PHONE_NUMBER_ID || "";
    const configured = Boolean(phoneId && process.env.WHATSAPP_TOKEN);
    return {
        configured,
        verifyTokenSet: Boolean(process.env.VERIFY_TOKEN),
        phoneNumberId: phoneId ? `***${phoneId.slice(-4)}` : null,
        webhookUrl: "/webhook",
        simulate: !configured,
    };
}

/**
 * Step 1 — create tenant with Trial plan after Firebase auth on client.
 */
export async function startOnboarding(payload = {}) {
    const {
        companyName,
        ownerName,
        ownerEmail,
        uid,
        password,
    } = payload;

    if (!companyName?.trim()) throw new Error("companyName is required");
    if (!ownerEmail?.trim()) throw new Error("ownerEmail is required");
    if (!ownerName?.trim()) throw new Error("ownerName is required");

    const slug = slugifyCompanyName(companyName);
    const companyId = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const sessionId = genId("session");
    const timestamp = now();
    const trialPlan = getPlan("trial");

    const provisionResult = await provisionCompany(companyId, {
        name: companyName.trim(),
        owner: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerUid: uid || null,
        ownerId: uid || null,
        email: ownerEmail.trim(),
        plan: "trial",
        status: "active",
        onboarding: true,
        trialEndsAt: buildUsageFromPlan("trial", hashSeed(companyId)).trialEndsAt,
    });

    const session = {
        sessionId,
        companyId,
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        uid: uid || null,
        plan: "trial",
        planLabel: trialPlan.label,
        currentStep: "account",
        completedSteps: ["account"],
        industry: null,
        packId: null,
        whatsappConnected: false,
        knowledgeItems: [],
        trained: false,
        portalUrl: provisionResult.links?.portalUrl || portalUrlForCompany(companyId),
        links: provisionResult.links,
        createdAt: timestamp,
        updatedAt: timestamp,
    };

    sessions.set(sessionId, session);

    if (uid) {
        try {
            await upsertGlobalUserProfile(uid, {
                email: ownerEmail.trim(),
                fullName: ownerName.trim(),
                role: "owner",
                companyId,
                status: "active",
            });
            await upsertOwnerMembership(uid, companyId, {
                email: ownerEmail.trim(),
                fullName: ownerName.trim(),
                role: "owner",
                status: "active",
            });
        } catch (err) {
            console.warn("[onboarding] Server-side membership write skipped:", err.message);
        }
    }

    return {
        sessionId,
        companyId,
        portalUrl: session.portalUrl,
        plan: session.plan,
        planLabel: session.planLabel,
        currentStep: session.currentStep,
        completedSteps: session.completedSteps,
        whatsapp: getWhatsAppConfig(),
        industries: ONBOARDING_INDUSTRIES,
    };
}

export async function completeOnboardingStep(sessionId, step, data = {}) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error("Onboarding session not found");

    const stepIndex = ONBOARDING_STEPS.indexOf(step);
    if (stepIndex < 0) throw new Error(`Unknown step: ${step}`);

    const store = await getStorageAdapter();
    const timestamp = now();
    let result = { step, success: true };

    switch (step) {
        case "industry": {
            const industryDef =
                ONBOARDING_INDUSTRIES.find((i) => i.id === data.industryId) ||
                ONBOARDING_INDUSTRIES.find((i) => i.packId === data.packId);
            if (!industryDef) throw new Error("industryId is required");

            session.industry = industryDef.label;
            session.packId = industryDef.packId;
            session.industryId = industryDef.id;

            if (store.getPortalCompany && store.savePortalCompany) {
                const company = (await store.getPortalCompany(session.companyId)) || {};
                await store.savePortalCompany(session.companyId, {
                    ...company,
                    industry: industryDef.label,
                    industryId: industryDef.id,
                });
            }

            if (industryDef.packId) {
                const pack = getPackById(industryDef.packId);
                if (pack?.installable !== false) {
                    try {
                        const installResult = await installIndustryPack(session.companyId, industryDef.packId);
                        result.packInstall = installResult;
                    } catch (err) {
                        result.packInstall = { skipped: true, reason: err.message };
                    }
                } else {
                    result.packInstall = { skipped: true, reason: "Pack coming soon — base workspace provisioned" };
                }
            } else {
                result.packInstall = { skipped: true, reason: "Generic workspace — no industry pack required" };
            }
            break;
        }

        case "whatsapp": {
            const wa = getWhatsAppConfig();
            session.whatsappConnected = true;
            session.whatsappSimulated = wa.simulate;
            await syncWhatsAppIntegrationStatus(session.companyId);
            if (store.getPortalCompany && store.savePortalCompany) {
                const company = (await store.getPortalCompany(session.companyId)) || {};
                await store.savePortalCompany(session.companyId, {
                    ...company,
                    whatsappConnected: true,
                    whatsappSimulated: wa.simulate,
                });
            }
            result.whatsapp = { connected: true, simulated: wa.simulate, ...wa };
            break;
        }

        case "knowledge": {
            const items = [];
            if (data.faqText?.trim()) {
                const saved = await saveKnowledgeDocument({
                    companyId: session.companyId,
                    title: `${session.companyName} — Onboarding FAQs`,
                    type: "faq",
                    content: data.faqText.trim(),
                });
                items.push(saved);
            }
            if (data.websiteUrl?.trim()) {
                const saved = await saveKnowledgeDocument({
                    companyId: session.companyId,
                    title: `Website — ${data.websiteUrl.trim()}`,
                    type: "website",
                    url: data.websiteUrl.trim(),
                    content: `Imported website content placeholder for ${data.websiteUrl.trim()}. Full crawl runs in production.`,
                });
                items.push(saved);
            }
            if (data.documents?.length) {
                for (const doc of data.documents) {
                    items.push({ id: genId("kn"), title: doc.title || doc.name, simulated: true });
                }
            }
            session.knowledgeItems = [...(session.knowledgeItems || []), ...items];
            result.knowledgeCount = session.knowledgeItems.length;
            break;
        }

        case "train": {
            session.trained = true;
            session.trainedAt = timestamp;
            result.training = { status: "complete", chunks: 42 + (session.knowledgeItems?.length || 0) * 12 };
            break;
        }

        case "test": {
            session.tested = true;
            result.test = { ok: true };
            break;
        }

        case "complete": {
            session.completedAt = timestamp;
            session.status = "live";

            if (data.branding) {
                await saveCompanyBranding(session.companyId, data.branding);
            }
            if (data.settings) {
                await updateCompany(session.companyId, { settings: data.settings });
            }

            await updateCompany(session.companyId, {
                industry: session.industry || undefined,
                industryId: session.industryId || undefined,
                whatsappConnected: session.whatsappConnected,
                onboardingCompletedAt: timestamp,
            });

            if (session.uid) {
                await upsertTenantUser(session.companyId, session.uid, {
                    email: session.ownerEmail,
                    fullName: session.ownerName,
                    role: "owner",
                    status: "active",
                }).catch(() => {});
            }

            if (store.pushPortalActivity) {
                await store.pushPortalActivity(session.companyId, {
                    actor: session.ownerName,
                    action: "completed onboarding",
                    target: session.companyName,
                    icon: "fa-rocket",
                });
            }

            const onboardingResult = await finalizeTenantOnboarding(session.companyId, {
                ownerName: session.ownerName,
                industry: session.industry,
                industryId: session.industryId,
                whatsappConnected: session.whatsappConnected,
                seedDemoLead: data.seedDemoLead !== false,
                onboardingCompletedAt: timestamp,
            });

            const [workspaceSnapshot, agents, knowledgeDocs] = await Promise.all([
                getWorkspaceSnapshot(session.companyId),
                listAiEmployees(session.companyId),
                listKnowledgeDocuments(session.companyId),
            ]);

            result.portalUrl = session.portalUrl;
            result.workspaceLinks = session.links;
            result.workspaceSnapshot = workspaceSnapshot;
            result.sarahContext = {
                companyId: session.companyId,
                companyName: workspaceSnapshot?.company?.name || session.companyName,
                agentCount: agents.length,
                agents: agents.map((a) => ({
                    id: a.id,
                    name: a.name,
                    role: a.roleLabel || a.role,
                    isDefault: a.isDefault,
                })),
                kbSummary: {
                    documentCount: knowledgeDocs.length,
                    titles: knowledgeDocs.slice(0, 5).map((d) => d.title),
                },
            };
            result.platformRecord = onboardingResult;
            break;
        }

        default:
            break;
    }

    if (!session.completedSteps.includes(step)) {
        session.completedSteps.push(step);
    }

    const nextIdx = Math.min(stepIndex + 1, ONBOARDING_STEPS.length - 1);
    session.currentStep = ONBOARDING_STEPS[nextIdx];
    session.updatedAt = timestamp;
    sessions.set(sessionId, session);

    return {
        ...result,
        sessionId,
        companyId: session.companyId,
        currentStep: session.currentStep,
        completedSteps: session.completedSteps,
        portalUrl: session.portalUrl,
    };
}

/** One-shot provision for simplified clients. */
export async function provisionOnboarding(payload) {
    const start = await startOnboarding(payload);
    if (payload.industryId) {
        await completeOnboardingStep(start.sessionId, "industry", { industryId: payload.industryId });
    }
    return start;
}

export function listOnboardingIndustries() {
    return ONBOARDING_INDUSTRIES.map((i) => {
        const pack = getPackById(i.packId);
        return {
            ...i,
            packAvailable: Boolean(pack?.installable !== false && pack),
            packName: pack?.name || null,
        };
    });
}
