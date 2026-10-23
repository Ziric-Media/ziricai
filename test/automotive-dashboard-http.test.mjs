/**
 * HTTP integration — real requireTenantScope() + handleAutomotiveDashboardRequest (same as mountAutomotiveRoutes).
 * Metrics loaders are injected here so the worktree can run without the broken CRM→Sarah import chain;
 * auth, preset gate, and tenant isolation use production code paths.
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
const { handleAutomotiveDashboardRequest } = await import("../services/api/automotiveRoutes.js");
const { requireTenantScope } = await import("../services/core/tenantContext.js");
const { buildAutomotiveDashboardMetrics } = await import("../services/automotive/automotiveMetricsService.js");
const { createCompany, updateCompany } = await import("../services/tenants/companyService.js");
const {
    mintFinanceAcceptanceToken,
    FINANCE_ACCEPTANCE_TENANT_ID,
    FINANCE_ACCEPTANCE_UIDS,
} = await import("../services/auth/financeAcceptanceMode.js");
const { AUTOMOTIVE_PRESET_ID } = await import("../services/automotive/automotiveIndustryPreset.js");
const { TenantRepository } = await import("../services/database/tenantRepository.js");
const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");
const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
const {
    seedVehicles,
    listVehiclesByCompany,
    _resetMemoryInventoryForTests,
} = await import("../services/inventory/inventoryService.js");

const OTHER_COMPANY = "automotive-http-other-co";

let server;
let baseUrl;

test.before(async () => {
    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();

    await createCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        name: "Automotive HTTP Test Dealer",
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetVersion: "1.0.0",
        industryPresetActivatedAt: new Date().toISOString(),
    });

    await createCompany(OTHER_COMPANY, {
        name: "Other Tenant",
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
        { stockNumber: "HTTP1", availability: "available", make: "Toyota" },
    ]);

    const inventoryLoaders = {
        listVehicles: (companyId) => listVehiclesByCompany(companyId),
        listLeads: async () => [],
        listAppointments: async () => [],
    };

    const app = express();
    app.get(
        "/api/companies/:companyId/automotive/dashboard",
        requireTenantScope(),
        async (req, res) => {
            try {
                const result = await handleAutomotiveDashboardRequest(req, {
                    buildMetrics: (dataCompanyId, query) =>
                        buildAutomotiveDashboardMetrics(dataCompanyId, query, Date.now(), inventoryLoaders),
                });
                return res.status(result.status).json(result.body);
            } catch (err) {
                const status = err.status || 500;
                return res.status(status).json({
                    error: err.message || "Automotive dashboard error",
                    code: err.code || "AUTOMOTIVE_DASHBOARD_ERROR",
                });
            }
        }
    );
    server = await new Promise((resolve, reject) => {
        const s = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(s)));
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    await new Promise((resolve) => server?.close(resolve));
});

function authHeaders(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getDashboard(companyId, token, query = "") {
    const res = await fetch(
        `${baseUrl}/api/companies/${encodeURIComponent(companyId)}/automotive/dashboard${query}`,
        { headers: authHeaders(token) }
    );
    let body = {};
    try {
        body = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, body };
}

test("HTTP: unauthenticated request is denied (strict tenant scope)", async () => {
    const { status, body } = await getDashboard(FINANCE_ACCEPTANCE_TENANT_ID, null);
    assert.equal(status, 401);
    assert.ok(body.code === "UNAUTHORIZED" || body.error);
});

test("HTTP: authenticated user without access to requested company is denied", async () => {
    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });
    const { status, body } = await getDashboard(OTHER_COMPANY, token);
    assert.equal(status, 403);
    assert.match(body.error || "", /Cross-tenant|denied|Forbidden/i);
});

test("HTTP: authorised Automotive tenant receives dashboard payload", async () => {
    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });
    const { status, body } = await getDashboard(FINANCE_ACCEPTANCE_TENANT_ID, token);
    assert.equal(status, 200);
    assert.equal(body.presetId, "automotive-dealership");
    assert.equal(body.inventory?.totals?.value, 1);
    assert.equal(body.requestedCompanyId, FINANCE_ACCEPTANCE_TENANT_ID);
});

test("HTTP: non-Automotive preset is denied", async () => {
    await updateCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        industryPresetId: "construction-engineering",
        industryPresetActivatedAt: new Date().toISOString(),
        industryPresetVersion: "1.0.0",
    });

    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });
    const { status, body } = await getDashboard(FINANCE_ACCEPTANCE_TENANT_ID, token);
    assert.equal(status, 403);
    assert.equal(body.code, "AUTOMOTIVE_PRESET_NOT_ACTIVE");

    await updateCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetActivatedAt: new Date().toISOString(),
        industryPresetVersion: "1.0.0",
    });
});

test("HTTP: inactive preset (missing activation timestamp) is denied", async () => {
    await updateCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetActivatedAt: null,
    });

    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });
    const { status, body } = await getDashboard(FINANCE_ACCEPTANCE_TENANT_ID, token);
    assert.equal(status, 403);
    assert.equal(body.code, "AUTOMOTIVE_PRESET_NOT_ACTIVE");

    await updateCompany(FINANCE_ACCEPTANCE_TENANT_ID, {
        industryPresetActivatedAt: new Date().toISOString(),
    });
});

test("HTTP: date query parameters are forwarded", async () => {
    const token = mintFinanceAcceptanceToken({
        uid: FINANCE_ACCEPTANCE_UIDS.owner,
        role: "owner",
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        exp: Date.now() + 60_000,
    });
    const { status, body } = await getDashboard(
        FINANCE_ACCEPTANCE_TENANT_ID,
        token,
        "?from=2026-10-01&to=2026-10-31"
    );
    assert.equal(status, 200);
    assert.equal(body.period?.from, "2026-10-01");
    assert.equal(body.period?.to, "2026-10-31");
});
