/**
 * Integration service — tenant third-party connections.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class IntegrationService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.INTEGRATIONS);
    }

    async getByProvider(companyId, provider) {
        const items = await this.list(companyId, { filters: { provider } });
        return items[0] || null;
    }
}

const integrationService = new IntegrationService();

export async function listIntegrations(companyId) {
    return integrationService.list(companyId);
}

export async function upsertIntegration(companyId, provider, config) {
    const existing = await integrationService.getByProvider(companyId, provider);
    if (existing?.id) {
        return integrationService.update(companyId, existing.id, { provider, ...config });
    }
    return integrationService.create(companyId, { provider, status: "connected", ...config });
}

export async function disconnectIntegration(companyId, integrationId) {
    return integrationService.update(companyId, integrationId, { status: "disconnected" });
}

export async function getWhatsAppIntegration(companyId) {
    return integrationService.getByProvider(companyId, "whatsapp");
}
