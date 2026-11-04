import assert from "node:assert/strict";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { createCompany } from "../services/tenants/companyService.js";
import { upsertWhatsAppPoolNumber, assignWhatsAppPoolNumberToCompany } from "../services/platform/whatsappNumberPoolService.js";
import { __resetMemoryPoolForTests } from "../services/platform/whatsappNumberPoolPoolIO.js";
import { evaluateCompanyWhatsAppReadiness } from "../services/platform/whatsappGatewayReadinessService.js";
import {
    simulateInboundRoutingProbe,
    isLiveWhatsAppProbeAuthorized,
} from "../services/platform/whatsappGatewayProbeService.js";
import { __clearGatewayProbeEventsForTests } from "../services/platform/whatsappGatewayProbeStore.js";
import { READINESS_STATE } from "../services/platform/whatsappGatewayReadinessStates.js";

process.env.STORAGE_BACKEND = "memory";
process.env.WHATSAPP_TOKEN = "test-token";
process.env.VERIFY_TOKEN = "verify-test";
process.env.META_APP_SECRET = "secret-test";
process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING = "primary";
process.env.WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED = "false";

const PHONE = "1209265748933799";

resetMemoryTenantStore();
__resetMemoryPoolForTests();
__clearGatewayProbeEventsForTests();

const companyId = `g6-tenant-${Date.now()}`;
await createCompany(companyId, { name: "G6 Tenant" });
await upsertWhatsAppPoolNumber({ id: `wa-${PHONE}`, phoneNumberId: PHONE, credentialsSource: "env" });

const notConfigured = await evaluateCompanyWhatsAppReadiness(companyId);
assert.equal(notConfigured.operational, false);
assert.ok(
    [READINESS_STATE.NOT_CONFIGURED, READINESS_STATE.NOT_REGISTERED, READINESS_STATE.DEGRADED].includes(
        notConfigured.overallState
    )
);

await assignWhatsAppPoolNumberToCompany({
    companyId,
    numberId: `wa-${PHONE}`,
    activate: true,
    operationId: "g6-test-assign",
});

const configured = await evaluateCompanyWhatsAppReadiness(companyId);
assert.equal(configured.operational, false, "no behavioral E2E evidence yet");
assert.notEqual(configured.overallState, READINESS_STATE.OPERATIONAL);
const inboundDim = configured.dimensions.find((d) => d.id === "inbound_routing");
assert.equal(inboundDim?.ok, true, "registry-primary routing should match assigned tenant");

const probe = await simulateInboundRoutingProbe({
    phoneNumberId: PHONE,
    expectedCompanyId: companyId,
});
assert.equal(probe.success, true);
assert.equal(probe.simulated, true);

assert.equal(isLiveWhatsAppProbeAuthorized(), false);

console.log("whatsapp-gateway-readiness.test.mjs OK");
