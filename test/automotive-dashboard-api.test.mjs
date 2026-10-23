process.env.INDUSTRY_PRESET_RUNTIME = "1";

import assert from "node:assert/strict";
import test from "node:test";

import { handleAutomotiveDashboardRequest } from "../services/api/automotiveRoutes.js";
import { AUTOMOTIVE_PRESET_ID, assertAutomotivePresetActive } from "../services/automotive/automotiveIndustryPreset.js";

const automotiveCompany = {
    companyId: "dealer-automotive-1",
    industryPresetId: AUTOMOTIVE_PRESET_ID,
    industryPresetVersion: "1.0.0",
    industryPresetActivatedAt: "2026-10-01T00:00:00.000Z",
};

const constructionCompany = {
    companyId: "dealer-construction-1",
    industryPresetId: "construction-engineering",
    industryPresetActivatedAt: "2026-10-01T00:00:00.000Z",
};

test("handleAutomotiveDashboardRequest returns metrics for authorised automotive tenant", async () => {
    const req = { params: { companyId: "dealer-automotive-1" }, query: { from: "2026-10-01", to: "2026-10-31" } };
    const result = await handleAutomotiveDashboardRequest(req, {
        getCompany: async (id) => (id === "dealer-automotive-1" ? automotiveCompany : null),
        assertPreset: assertAutomotivePresetActive,
        resolveDataCompanyId: (id) => id,
        buildMetrics: async (dataCompanyId) => ({
            companyId: dataCompanyId,
            inventory: { totals: { status: "empty", value: 0 } },
        }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.requestedCompanyId, "dealer-automotive-1");
    assert.equal(result.body.companyId, "dealer-automotive-1");
});

test("handleAutomotiveDashboardRequest 404 when company missing", async () => {
    const result = await handleAutomotiveDashboardRequest(
        { params: { companyId: "missing" }, query: {} },
        { getCompany: async () => null }
    );
    assert.equal(result.status, 404);
    assert.equal(result.body.code, "COMPANY_NOT_FOUND");
});

test("handleAutomotiveDashboardRequest 403 for non-automotive preset", async () => {
    await assert.rejects(
        () =>
            handleAutomotiveDashboardRequest(
                { params: { companyId: "dealer-construction-1" }, query: {} },
                {
                    getCompany: async () => constructionCompany,
                    assertPreset: assertAutomotivePresetActive,
                }
            ),
        (err) => err.status === 403 && err.code === "AUTOMOTIVE_PRESET_NOT_ACTIVE"
    );
});

test("pilot mapping resolves data company separately from requested company id", async () => {
    const req = { params: { companyId: "demo-central-motors" }, query: {} };
    let resolvedDataId = null;
    const result = await handleAutomotiveDashboardRequest(req, {
        getCompany: async () => automotiveCompany,
        assertPreset: async () => {},
        resolveDataCompanyId: () => {
            resolvedDataId = "central-motors-rtb";
            return resolvedDataId;
        },
        buildMetrics: async (dataCompanyId) => ({ companyId: dataCompanyId }),
    });
    assert.equal(resolvedDataId, "central-motors-rtb");
    assert.equal(result.body.companyId, "central-motors-rtb");
    assert.equal(result.body.requestedCompanyId, "demo-central-motors");
});

test("buildMetrics loader failure surfaces unavailable inventory, not fake zeros", async () => {
    const { buildAutomotiveDashboardMetrics } = await import("../services/automotive/automotiveMetricsService.js");
    const payload = await buildAutomotiveDashboardMetrics(
        "co-fail",
        { from: "2026-10-01", to: "2026-10-31" },
        Date.now(),
        {
            listVehicles: async () => null,
            listLeads: async () => [],
            listAppointments: async () => [],
        }
    );
    assert.equal(payload.inventory.totals.status, "unavailable");
    assert.equal(payload.inventory.totals.value, null);
    assert.equal(payload.sales.unitsSoldInPeriod.status, "unavailable");
});
