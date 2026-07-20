/**
 * Tenant bootstrap — post-provision wiring for platform ops, marketplace, and event chain.
 */
import { publish, EventTypes } from "../events/index.js";
import { flushAnalytics } from "../analytics/analyticsEngine.js";
import {
    registerPlatformCompany,
    enableMarketplaceForTenant,
    recordCompanyOnboardedActivity,
    recordCompanyCreatedActivity,
    pushPlatformActivity,
} from "./platformRegistry.js";
import { upsertIntegration } from "../tenants/integrationService.js";
import { upsertCustomerFromWhatsApp } from "../customerService.js";

function now() {
    return new Date().toISOString();
}

function getWhatsAppEnvConfig() {
    const phoneId = process.env.PHONE_NUMBER_ID || "";
    const configured = Boolean(phoneId && process.env.WHATSAPP_TOKEN);
    return {
        configured,
        simulate: !configured,
        phoneNumberId: phoneId ? `***${phoneId.slice(-4)}` : null,
        webhookUrl: "/webhook",
    };
}

/**
 * Wire WhatsApp integration status after onboarding connect step.
 * @param {string} companyId
 */
export async function syncWhatsAppIntegrationStatus(companyId) {
    const wa = getWhatsAppEnvConfig();
    return upsertIntegration(companyId, "whatsapp", {
        status: wa.configured ? "connected" : "simulated",
        simulated: wa.simulate,
        phoneNumberId: wa.phoneNumberId,
        webhookUrl: wa.webhookUrl,
        connectedAt: now(),
    });
}

/**
 * Register tenant with platform ops and enable marketplace catalog access.
 * @param {string} companyId
 * @param {object} [meta]
 */
export async function bootstrapTenantPlatform(companyId, meta = {}) {
    const record = await registerPlatformCompany(companyId, meta);
    await enableMarketplaceForTenant(companyId);

    if (meta.emitCreatedActivity !== false && meta.isNew !== false) {
        recordCompanyCreatedActivity(companyId, record.name);
    }

    return record;
}

/**
 * Finalize onboarding — platform visibility, optional demo lead, completion activity.
 * @param {string} companyId
 * @param {object} [context]
 */
export async function finalizeTenantOnboarding(companyId, context = {}) {
    const record = await registerPlatformCompany(companyId, {
        ...context,
        onboardingCompletedAt: context.onboardingCompletedAt || now(),
        marketplaceEnabled: true,
    });

    await enableMarketplaceForTenant(companyId);

    if (context.whatsappConnected !== false) {
        await syncWhatsAppIntegrationStatus(companyId);
    }

    recordCompanyOnboardedActivity(companyId, record.name, context.ownerName || record.owner);

    if (context.seedDemoLead) {
        const phone = `+2710000${String(hashPhone(companyId)).slice(-4)}`;
        await upsertCustomerFromWhatsApp(phone, {
            contactName: "Sample Lead",
            companyId,
            companyName: record.name,
            messagePreview: "Interested in your services (onboarding seed)",
            leadScore: 72,
            tags: ["onboarding-seed"],
        }).catch(() => {});

        await publish(companyId, EventTypes.LEAD_CAPTURED, {
            source: "onboarding_seed",
            phone,
            name: "Sample Lead",
            leadScore: 72,
        }).catch(() => {});
    }

    await flushAnalytics().catch(() => {});

    return record;
}

function hashPhone(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/**
 * Emit subscription started event after billing record is saved.
 * @param {string} companyId
 * @param {object} billing
 */
export async function emitSubscriptionStarted(companyId, billing = {}) {
    await publish(companyId, EventTypes.SUBSCRIPTION_STARTED, {
        planId: billing.planId || "trial",
        status: billing.status || "trialing",
        trialEndsAt: billing.trialEndsAt || null,
        renewalDate: billing.renewalDate || null,
    }).catch(() => {});

    pushPlatformActivity({
        type: "subscription",
        icon: "fa-credit-card",
        color: "yellow",
        text: `Trial started for <strong>${companyId}</strong>`,
        detail: `Plan: ${billing.planId || "trial"} — renews ${billing.renewalDate || "—"}`,
        companyId,
    });
}

/**
 * Emit company created event (before full provision completes).
 * @param {string} companyId
 * @param {object} companyData
 */
export async function emitCompanyCreated(companyId, companyData = {}) {
    await publish(companyId, EventTypes.COMPANY_CREATED, {
        companyId,
        name: companyData.name || companyId,
        plan: companyData.plan || "trial",
        ownerEmail: companyData.ownerEmail || "",
    }).catch(() => {});
}
