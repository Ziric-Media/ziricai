import assert from "node:assert/strict";
import test from "node:test";

import {
    formatAutomotiveMetric,
    breakdownToChartRows,
    shouldApplyAutomotiveDashboardResponse,
    salesMetricCardTitle,
} from "../js/portal/automotive/automotiveMetricDisplay.js";
import { buildAutomotiveCommandCentreViewModel } from "../js/portal/automotive/automotiveCommandCentreModel.js";

const FIXTURE = {
    schemaVersion: "1.0.0",
    presetId: "automotive-dealership",
    generatedAt: "2026-10-22T12:00:00.000Z",
    period: { from: "2026-10-01", to: "2026-10-31", timezonePolicy: "UTC" },
    inventory: {
        totals: { status: "ok", value: 3 },
        byAvailability: {
            available: { status: "ok", value: 2 },
            reserved: { status: "ok", value: 1 },
            sold: { status: "ok", value: 0 },
            unavailable: { status: "ok", value: 0 },
        },
        byMake: { status: "ok", value: { Toyota: 2, BMW: 1 } },
        byBodyType: { status: "unavailable", value: null, reason: "no_body_type" },
        byCondition: { status: "empty", value: 0 },
    },
    sales: {
        unitsSoldInPeriod: { status: "empty", value: 0 },
        realisedSalesValue: { status: "unavailable", value: null, reason: "no_authoritative_sale_amount" },
        listingPriceSumForSoldInPeriod: {
            status: "empty",
            value: 0,
            notRealisedRevenue: true,
        },
        grossProfit: { status: "unavailable", value: null },
    },
    crm: {
        byStage: { status: "ok", value: { new: 2, won: 1 } },
        openOpportunities: { status: "ok", value: 2 },
    },
    appointments: {
        upcomingInPeriod: { status: "ok", value: 4 },
        testDrivesInPeriod: { status: "ok", value: 1 },
        testDrivesTodayUtc: { status: "ok", value: 0 },
    },
};

test("formatAutomotiveMetric distinguishes empty, ok and unavailable", () => {
    assert.equal(formatAutomotiveMetric({ status: "empty", value: 0 }).kind, "empty");
    assert.equal(formatAutomotiveMetric({ status: "ok", value: 5 }).display, "5");
    assert.equal(formatAutomotiveMetric({ status: "unavailable", value: null }).kind, "unavailable");
    assert.equal(formatAutomotiveMetric(null).kind, "unavailable");
});

test("buildAutomotiveCommandCentreViewModel uses API fixture — not live Central Motors data", () => {
    const vm = buildAutomotiveCommandCentreViewModel(FIXTURE);
    assert.match(vm.periodLabel, /2026-10-01/);
    assert.equal(vm.kpis.find((k) => k.id === "total").display, "3");
    assert.equal(vm.financial.realised.kind, "unavailable");
    assert.equal(vm.financial.listing.notRealisedRevenue, true);
    assert.equal(vm.financial.gross.kind, "unavailable");
});

test("listing price metric is not labelled as realised revenue", () => {
    const title = salesMetricCardTitle("Listing price total", { notRealisedRevenue: true });
    assert.match(title, /not realised revenue/i);
});

test("breakdown charts handle unavailable and empty", () => {
    assert.equal(breakdownToChartRows(FIXTURE.inventory.byBodyType), null);
    const rows = breakdownToChartRows(FIXTURE.inventory.byMake);
    assert.equal(rows.length, 2);
});

test("stale response guard rejects outdated generation", () => {
    assert.equal(shouldApplyAutomotiveDashboardResponse(2, 2), true);
    assert.equal(shouldApplyAutomotiveDashboardResponse(2, 3), false);
});

test("failed API payload does not produce zero-filled financial KPIs as ok", () => {
    const vm = buildAutomotiveCommandCentreViewModel({
        ...FIXTURE,
        sales: {
            unitsSoldInPeriod: { status: "unavailable", value: null },
            realisedSalesValue: { status: "unavailable", value: null },
            listingPriceSumForSoldInPeriod: { status: "unavailable", value: null },
            grossProfit: { status: "unavailable", value: null },
        },
    });
    assert.equal(vm.financial.realised.kind, "unavailable");
    assert.equal(vm.kpis.find((k) => k.id === "unitsSoldPeriod").kind, "unavailable");
});
