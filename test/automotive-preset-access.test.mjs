process.env.INDUSTRY_PRESET_RUNTIME = "1";

import assert from "node:assert/strict";
import test from "node:test";

import {
    AUTOMOTIVE_PRESET_ID,
    assertAutomotivePresetActive,
    shouldUseAutomotiveLiveKpis,
} from "../services/automotive/automotiveIndustryPreset.js";
import { shouldUseDemoFallback, DEMO_COMPANY_ID } from "../services/core/dataMode.js";
import { buildAutomotiveDashboardFromData } from "../services/automotive/automotiveMetricsCore.js";

test("assertAutomotivePresetActive rejects missing and non-automotive tenants", async () => {
    await assert.rejects(() => assertAutomotivePresetActive(null), (err) => err.status === 404);
    await assert.rejects(
        () =>
            assertAutomotivePresetActive({
                companyId: "x",
                industryPresetId: "construction-engineering",
                industryPresetActivatedAt: "2026-10-01T00:00:00.000Z",
            }),
        (err) => err.status === 403 && err.code === "AUTOMOTIVE_PRESET_NOT_ACTIVE"
    );
});

test("assertAutomotivePresetActive accepts activated automotive preset", async () => {
    const resolved = await assertAutomotivePresetActive({
        companyId: "dealer-1",
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetVersion: "1.0.0",
        industryPresetActivatedAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(resolved.active, true);
    assert.equal(resolved.preset.presetId, AUTOMOTIVE_PRESET_ID);
});

test("provisioned automotive tenant disables portal demo KPI merge", () => {
    const companyRecord = {
        industryPresetId: AUTOMOTIVE_PRESET_ID,
        industryPresetActivatedAt: "2026-10-01T00:00:00.000Z",
    };
    const automotiveLive = shouldUseAutomotiveLiveKpis({ companyRecord, isProvisioned: true });
    assert.equal(automotiveLive, true);

    const useDemoContent =
        !automotiveLive &&
        shouldUseDemoFallback({
            companyId: DEMO_COMPANY_ID,
            isDemo: true,
            isProvisioned: true,
        });
    assert.equal(useDemoContent, false);
});

test("showcase demo-central-motors without preset activation still uses demo fallback", () => {
    const automotiveLive = shouldUseAutomotiveLiveKpis({
        companyRecord: null,
        isProvisioned: false,
    });
    assert.equal(automotiveLive, false);
    assert.equal(
        shouldUseDemoFallback({
            companyId: DEMO_COMPANY_ID,
            isDemo: true,
            isProvisioned: false,
        }),
        true
    );
});

test("inventory source failure is unavailable not a confirmed zero", () => {
    const payload = buildAutomotiveDashboardFromData({
        vehicles: null,
        leads: [],
        appointments: [],
        period: { from: "2026-10-01", to: "2026-10-31", timezonePolicy: "UTC", inclusiveEnd: true },
        todayUtc: "2026-10-20",
        dataCompanyId: "co",
        nowMs: Date.now(),
    });
    assert.equal(payload.inventory.totals.status, "unavailable");
    assert.equal(payload.inventory.totals.value, null);
});
