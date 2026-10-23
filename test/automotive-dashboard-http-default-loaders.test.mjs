/**
 * HTTP integration with mountAutomotiveRoutes() and default metrics loaders (no injection).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = "strict";
process.env.INDUSTRY_PRESET_RUNTIME = "1";
process.env.FINANCE_ACCEPTANCE_LOOPBACK = "1";
process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.FINANCE_ACCEPTANCE_SECRET = process.env.FINANCE_ACCEPTANCE_SECRET || crypto.randomBytes(32).toString("hex");

const express = (await import("express")).default;
const { mountAutomotiveRoutes } = await import("../services/api/automotiveRoutes.js");
const { createCompany } = await import("../services/tenants/companyService.js");
const {
    mintFinanceAcceptanceToken,
    FINANCE_ACCEPTANCE_TENANT_ID,
    FINANCE_ACCEPTANCE_UIDS,
} = await import("../services/auth/financeAcceptanceMode.js");
const { AUTOMOTIVE_PRESET_ID } = await import("../services/automotive/automotiveIndustryPreset.js");
const { TenantRepository, resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");
const { seedVehicles, _resetMemoryInventoryForTests } = await import("../services/inventory/inventoryService.js");
const { createLead } = await import("../services/tenants/crmService.js");
const { createAppointment } = await import("../services/tenants/appointmentService.js");

let server;
let baseUrl;

test.before(async () => {
    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();

    await createCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        name: "Default Loader HTTP Dealer",
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetVersion: "1.0.0",
        industryPresetActivatedAt: new Date().toISOString(),
    });

    const usersRepo = new TenantRepository(TENANT_COLLECTIONS.USERS);
    await usersRepo.create(
        FINANCE_ACCEPTANCE_TENANT_ID,
        { uid: FINANCE_ACCEPTANCE_UIDS.owner, role: "owner", companyId: FINANCE_ACCEPTANCE_TENANT_ID },
        FINANCE_ACCEPTANCE_UIDS.owner
    );

    await seedVehicles(FINANCE_ACCEPTANCE_TENANT_ID, [
        { stockNumber: "DL1", availability: "available", make: "Toyota", metadata: { bodyType: "SUV" } },
    ]);
    await createLead(FINANCE_ACCEPTANCE_TENANT_ID, { stage: "new", name: "Lead A" });
    await createAppointment(FINANCE_ACCEPTANCE_TENANT_ID, {
        scheduledAt: "2026-10-22T10:00:00.000Z",
        status: "scheduled",
        appointmentType: "test_drive",
    });

    const app = express();
    mountAutomotiveRoutes(app);
    server = await new Promise((resolve, reject) => {
        const s = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(s)));
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    await new Promise((resolve) => server?.close(resolve));
});

test("mountAutomotiveRoutes default loaders return CRM and appointment aggregates", async () => {
    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });

    const res = await fetch(
        `${baseUrl}/api/companies/${encodeURIComponent(FINANCE_ACCEPTANCE_TENANT_ID)}/automotive/dashboard?from=2026-10-01&to=2026-10-31`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await res.json();

    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.inventory?.totals?.value, 1);
    assert.equal(body.crm?.byStage?.value?.new, 1);
    assert.equal(body.appointments?.testDrivesInPeriod?.value, 1);
    assert.ok(
        ["empty", "unavailable"].includes(body.sales?.realisedSalesValue?.status),
        `expected empty or unavailable realised sales, got ${body.sales?.realisedSalesValue?.status}`
    );
});
