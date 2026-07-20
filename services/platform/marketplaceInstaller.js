/**
 * Marketplace installation wizard — 5-step backend workflow.
 * Step 1: Preview → 2: Branding → 3: Integrations → 4: Install → 5: Success
 */
import { getPackById, resolvePackId } from "./marketplaceRegistry.js";
import { buildPackManifest, getDemoReviews, resolveCanonicalPackId } from "./marketplaceTemplate.js";
import { installIndustryPack, isPackInstalled, getInstalledPacks } from "./industryPackService.js";
import { checkForUpdates } from "./marketplaceVersioning.js";
import { validatePackInstall } from "./marketplaceInstallValidator.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { publish, EventTypes } from "../events/index.js";

const WIZARD_STEPS = ["preview", "branding", "integrations", "install", "success"];

async function adapter() {
    return getStorageAdapter();
}

/**
 * Step 1 — Preview pack contents checklist.
 */
export function previewPack(packId) {
    const resolved = resolvePackId(packId);
    const pack = getPackById(resolved);
    if (!pack) throw new Error(`Pack not found: ${packId}`);

    const manifest = buildPackManifest(pack);
    const reviews = getDemoReviews(resolved);

    return {
        step: 1,
        stepName: "preview",
        pack: {
            id: manifest.id,
            canonicalId: manifest.canonicalId,
            name: manifest.name,
            description: manifest.description,
            icon: manifest.icon,
            category: manifest.category,
            price: manifest.price,
            priceLabel: manifest.priceLabel,
            isFree: manifest.isFree,
            isPaid: manifest.isPaid,
            version: manifest.version,
            rating: manifest.rating,
            ratingCount: manifest.ratingCount,
            inheritanceChain: manifest.inheritanceChain,
            extends: manifest.extends,
        },
        contents: manifest.contents,
        contentsChecklist: [
            { key: "knowledge", label: "Knowledge Base", items: manifest.contents.knowledge, count: manifest.contents.knowledge.length },
            { key: "flows", label: "Conversation Flows", items: manifest.contents.flows, count: manifest.contents.flows.length },
            { key: "automations", label: "Automations", items: manifest.contents.automations, count: manifest.contents.automations.length },
            { key: "integrations", label: "Suggested Integrations", items: manifest.contents.integrations, count: manifest.contents.integrations.length },
            { key: "prompts", label: "Prompt Templates", items: manifest.contents.prompts, count: manifest.contents.prompts.length },
            { key: "faqs", label: "Industry FAQs", items: manifest.contents.faqs, count: manifest.contents.faqs.length },
            { key: "actions", label: "Suggested Actions", items: manifest.contents.actions, count: manifest.contents.actions.length },
            { key: "analytics", label: "Default Analytics", items: manifest.contents.analytics, count: manifest.contents.analytics.length },
        ],
        reviews: reviews.slice(0, 5),
        wizardSteps: WIZARD_STEPS,
        estimatedMinutes: 4,
    };
}

/**
 * Step 2 — Validate branding customizations (optional).
 */
export function validateBranding(customizations = {}) {
    const branding = customizations.branding || {};
    return {
        step: 2,
        stepName: "branding",
        valid: true,
        branding: {
            agentName: branding.agentName || null,
            greetingMessage: branding.greetingMessage || null,
            primaryColor: branding.primaryColor || null,
            logoUrl: branding.logoUrl || null,
        },
        message: "Branding will be applied to provisioned AI employees after install.",
    };
}

/**
 * Step 3 — Select integrations to enable.
 */
export function selectIntegrations(packId, selected = []) {
    const preview = previewPack(packId);
    const available = preview.contents.integrations;
    const enabled = selected.length ? selected.filter((id) => available.includes(id)) : available;

    return {
        step: 3,
        stepName: "integrations",
        available,
        enabled,
        disabled: available.filter((id) => !enabled.includes(id)),
    };
}

/**
 * Step 4 — Execute install with customizations.
 */
export async function executeInstall(companyId, packId, options = {}) {
    if (!companyId) throw new Error("companyId is required");
    if (!packId) throw new Error("packId is required");

    const resolved = resolvePackId(packId);
    const manifest = buildPackManifest(getPackById(resolved));

    if (manifest.isPaid && options.demoMode !== true && options.skipPayment !== true) {
        return {
            step: 4,
            stepName: "install",
            requiresPayment: true,
            price: manifest.price,
            message: "This is a paid template. Contact sales or enable demo mode to install.",
            contactSales: true,
            demoInstallAvailable: true,
        };
    }

    const customizations = {
        branding: options.branding || {},
        enabledIntegrations: options.integrations || manifest.suggestedIntegrations,
        disabledIntegrations: options.disabledIntegrations || [],
    };

    const result = await installIndustryPack(companyId, resolved, customizations);

    if (!result.alreadyInstalled) {
        const validation = await validatePackInstall(companyId, result, resolved);
        if (!validation.valid) {
            throw new Error(
                `Install validation failed: ${validation.errors.join("; ")}`
            );
        }
        result.validation = validation;
        result.verifiedSummary = validation.summary;
    }

    const store = await adapter();
    if (store.updateInstalledPack && !result.alreadyInstalled) {
        await store.updateInstalledPack(companyId, resolved, {
            customizations,
            enabledIntegrations: customizations.enabledIntegrations,
        });
    }

    if (!result.alreadyInstalled) {
        await publish(companyId, EventTypes.KNOWLEDGE_UPLOADED, {
            packId: resolved,
            packName: result.packName || resolved,
            source: "marketplace",
            knowledgeDocIds: result.knowledgeDocIds || result.links?.knowledgeDocIds || [],
        }).catch(() => {});

        await publish(companyId, "IndustryPackInstalled", {
            packId: resolved,
            packName: result.packName || resolved,
            validation: result.validation?.verified || null,
        }).catch(() => {});
    }

    return {
        step: 4,
        stepName: "install",
        ...result,
        customizations,
    };
}

/**
 * Step 5 — Success summary with navigation links.
 */
export async function installSuccess(companyId, packId) {
    const resolved = resolvePackId(packId);
    const { items } = await getInstalledPacks(companyId);
    const installed = items.find(
        (p) => resolveCanonicalPackId(p.packId) === resolveCanonicalPackId(resolved)
    );

    const updates = await checkForUpdates(companyId, resolved);

    return {
        step: 5,
        stepName: "success",
        installed: installed || null,
        links: installed?.links || {},
        navigate: {
            agents: "agents",
            knowledge: "knowledge",
            automation: "automation",
            customers: "customers",
            analytics: "analytics",
            integrations: "integrations",
        },
        updatesAvailable: updates.updates?.length > 0,
        message: installed
            ? `${installed.packName} is ready. Customize knowledge and connect integrations anytime.`
            : "Installation complete.",
    };
}

/**
 * Full wizard runner — supports step-by-step or one-shot install.
 */
export async function runInstallWizard(companyId, packId, options = {}) {
    const step = options.step || "install";

    switch (step) {
        case "preview":
            return previewPack(packId);
        case "branding":
            return validateBranding(options.customizations);
        case "integrations":
            return selectIntegrations(packId, options.integrations);
        case "install":
            return executeInstall(companyId, packId, options);
        case "success":
            return installSuccess(companyId, packId);
        default:
            return executeInstall(companyId, packId, options);
    }
}

/**
 * Get full pack detail for pack detail modal.
 */
export function getPackDetail(packId) {
    return previewPack(packId);
}

/**
 * Search & filter catalog packs.
 */
export function filterCatalogPacks(packs, { q = "", category = "", price = "" } = {}) {
    let filtered = [...packs];

    if (q) {
        const query = q.toLowerCase();
        filtered = filtered.filter(
            (p) =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query) ||
                p.tagline?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
        );
    }

    if (category) {
        filtered = filtered.filter(
            (p) => p.category === category || p.legacyCategory === category || p.browseCategory === category
        );
    }

    if (price === "free") {
        filtered = filtered.filter((p) => p.isFree || p.price === 0);
    } else if (price === "paid") {
        filtered = filtered.filter((p) => p.isPaid || p.price > 0);
    }

    return filtered;
}

export async function submitReview(companyId, packId, review, author = "Tenant User") {
    if (!companyId) throw new Error("companyId is required");
    if (!packId) throw new Error("packId is required");
    if (!review?.rating) throw new Error("rating is required");

    const resolved = resolvePackId(packId);
    const entry = {
        id: `rev-${Date.now()}`,
        packId: resolved,
        companyId,
        author: review.author || author,
        rating: Math.min(5, Math.max(1, Number(review.rating))),
        title: review.title || "",
        body: review.body || "",
        createdAt: new Date().toISOString(),
    };

    const store = await adapter();
    if (store.saveMarketplaceReview) {
        await store.saveMarketplaceReview(resolved, entry);
        await store.updatePackRating(resolved, entry.rating);
    }

    return { success: true, review: entry };
}

export { WIZARD_STEPS };
