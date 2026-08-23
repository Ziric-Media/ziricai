/**
 * Seed Central Motors WhatsApp integration into Firestore (or memory) when missing.
 * Resolves phoneNumberId 1209265748933699 → demo-central-motors (Sarah).
 */
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    upsertWhatsAppIntegration,
    warmPhoneResolutionCache,
} from "../tenants/integrationService.js";

export const CENTRAL_MOTORS_PHONE_NUMBER_ID = "1209265748933699";
export const CENTRAL_MOTORS_COMPANY_ID = "demo-central-motors";

const DEMO_WHATSAPP_INTEGRATION = {
    channel: "whatsapp",
    provider: "whatsapp",
    phoneNumberId: CENTRAL_MOTORS_PHONE_NUMBER_ID,
    businessAccountId: process.env.WABA_ID || null,
    displayPhoneNumber: process.env.DISPLAY_PHONE_NUMBER || null,
    status: "active",
    /** Tokens remain in env (WHATSAPP_TOKEN) — not stored in Firestore. */
    credentialsSource: "env",
};

export async function seedDemoWhatsAppIntegrationIfMissing() {
    const existing = await findActiveWhatsAppIntegrationByPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
    if (existing?.companyId === CENTRAL_MOTORS_COMPANY_ID) {
        warmPhoneResolutionCache(CENTRAL_MOTORS_PHONE_NUMBER_ID, existing);
        return { seeded: false, reason: "integration already exists", integrationId: existing.id };
    }

    const integration = await upsertWhatsAppIntegration(CENTRAL_MOTORS_COMPANY_ID, DEMO_WHATSAPP_INTEGRATION);
    warmPhoneResolutionCache(CENTRAL_MOTORS_PHONE_NUMBER_ID, integration);
    console.log(
        "[seed] Loaded WhatsApp integration",
        CENTRAL_MOTORS_PHONE_NUMBER_ID,
        "→",
        CENTRAL_MOTORS_COMPANY_ID
    );
    return { seeded: true, integrationId: integration.id };
}
