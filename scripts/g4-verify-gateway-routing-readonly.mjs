#!/usr/bin/env node
/**
 * G4 — Read-only verify registry-first routing resolution (production-safe).
 *
 * Usage:
 *   npx @railway/cli run node scripts/g4-verify-gateway-routing-readonly.mjs
 */
import {
    getWhatsAppGatewayRoutingMode,
    resolveTenantFromRegistry,
    resolveWhatsAppInboundCompanyId,
} from "../services/platform/whatsappGatewayService.js";
import { findWhatsAppRegistryByPhoneNumberId } from "../services/platform/whatsappNumberPoolService.js";
import { getWhatsAppIntegration, maskPhoneNumberId } from "../services/tenants/integrationService.js";

const MANAGED_PHONE_SUFFIX = "3699";
const CLIENT_ZERO_COMPANY = "ziricai";

async function main() {
    const mode = getWhatsAppGatewayRoutingMode();
    const managedPhoneId =
        (await findWhatsAppRegistryByPhoneNumberId("1209265748933699"))?.phoneNumberId ||
        "1209265748933699";

    const cz = await getWhatsAppIntegration(CLIENT_ZERO_COMPANY);
    const byoPhoneId = cz?.phoneNumberId ? String(cz.phoneNumberId) : null;

    const cases = [
        {
            name: "managed_backbone_3699",
            phoneNumberId: managedPhoneId,
            expectCompanyId: "central-motors-rtb",
        },
    ];
    if (byoPhoneId) {
        cases.push({
            name: "client_zero_byo",
            phoneNumberId: byoPhoneId,
            expectCompanyId: CLIENT_ZERO_COMPANY,
        });
    }

    const results = [];
    for (const c of cases) {
        const [registry, inbound] = await Promise.all([
            resolveTenantFromRegistry(c.phoneNumberId),
            resolveWhatsAppInboundCompanyId(c.phoneNumberId),
        ]);
        results.push({
            case: c.name,
            phoneNumberIdMasked: maskPhoneNumberId(c.phoneNumberId),
            routingMode: mode,
            registrySource: registry.source,
            registryCompanyId: registry.companyId,
            inboundCompanyId: inbound.companyId,
            inboundVia: inbound.via,
            shadow: inbound.shadow || null,
            expectCompanyId: c.expectCompanyId,
            ok: inbound.companyId === c.expectCompanyId,
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        routingMode: mode,
        allOk: results.every((r) => r.ok),
        results,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.allOk ? 0 : 1);
}

main().catch((err) => {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
});
