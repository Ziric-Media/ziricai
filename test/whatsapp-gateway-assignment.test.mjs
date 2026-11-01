import assert from "node:assert/strict";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { createCompany } from "../services/tenants/companyService.js";
import {
    __resetMemoryPoolForTests,
    writePoolRegistryDoc,
} from "../services/platform/whatsappNumberPoolPoolIO.js";
import {
    assignWhatsAppPoolNumberToCompany,
    releaseWhatsAppPoolNumber,
    upsertWhatsAppPoolNumber,
} from "../services/platform/whatsappNumberPoolService.js";
import {
    ALLOCATION_RESERVED,
    ALLOCATION_SUSPENDED,
} from "../services/platform/whatsappGatewayRegistry.js";
import { executeGatewayAssign } from "../services/platform/whatsappGatewayAssignmentService.js";

process.env.STORAGE_BACKEND = "memory";
process.env.WHATSAPP_GATEWAY_ASSIGN_TRANSACTIONS = "false";
process.env.WHATSAPP_TOKEN = "test-token";

const PHONE_A = "1209265748933701";
const PHONE_B = "1209265748933702";

async function setup() {
    resetMemoryTenantStore();
    __resetMemoryPoolForTests();
    await createCompany("tenant-a", { name: "Tenant A" });
    await createCompany("tenant-b", { name: "Tenant B" });
    await upsertWhatsAppPoolNumber({
        id: `wa-${PHONE_A}`,
        phoneNumberId: PHONE_A,
        credentialsSource: "env",
    });
    await upsertWhatsAppPoolNumber({
        id: `wa-${PHONE_B}`,
        phoneNumberId: PHONE_B,
        credentialsSource: "env",
    });
}

await setup();
const op1 = "op-assign-a-1";
const assigned = await assignWhatsAppPoolNumberToCompany({
    companyId: "tenant-a",
    numberId: `wa-${PHONE_A}`,
    activate: true,
    operationId: op1,
});
assert.equal(assigned.success, true);
assert.equal(assigned.number.assignedCompanyId, "tenant-a");

const replay = await assignWhatsAppPoolNumberToCompany({
    companyId: "tenant-a",
    numberId: `wa-${PHONE_A}`,
    operationId: op1,
});
assert.equal(replay.idempotentReplay, true);

await assert.rejects(
    () =>
        assignWhatsAppPoolNumberToCompany({
            companyId: "tenant-b",
            numberId: `wa-${PHONE_A}`,
            activate: true,
        }),
    (err) => err.status === 409
);

await writePoolRegistryDoc(`wa-${PHONE_B}`, {
    allocationStatus: ALLOCATION_SUSPENDED,
    status: "in_use",
});

await assert.rejects(
    () =>
        executeGatewayAssign({
            companyId: "tenant-b",
            numberId: `wa-${PHONE_B}`,
        }),
    (err) => err.code === "NUMBER_SUSPENDED"
);

await writePoolRegistryDoc(`wa-${PHONE_B}`, {
    allocationStatus: ALLOCATION_RESERVED,
    status: "reserved",
    assignedCompanyId: null,
});

await assert.rejects(
    () =>
        executeGatewayAssign({
            companyId: "tenant-b",
            numberId: `wa-${PHONE_B}`,
        }),
    (err) => err.code === "NUMBER_RESERVED"
);

await assert.rejects(
    () =>
        releaseWhatsAppPoolNumber({
            numberId: `wa-${PHONE_A}`,
            companyId: "tenant-b",
        }),
    (err) => err.code === "RELEASE_OWNER_MISMATCH"
);

const releaseOp = "op-release-a";
const released = await releaseWhatsAppPoolNumber({
    numberId: `wa-${PHONE_A}`,
    companyId: "tenant-a",
    operationId: releaseOp,
});
assert.equal(released.success, true);
assert.equal(released.previousCompanyId, "tenant-a");

console.log("whatsapp-gateway-assignment.test.mjs OK");
