process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import {
    _resetMemoryInventoryForTests,
    listVehiclesByCompany,
    seedVehicles,
} from "../services/inventory/inventoryService.js";
import { buildAutomotiveDashboardMetrics } from "../services/automotive/automotiveMetricsService.js";
import {
    buildAutomotiveDashboardFromData,
    resolveAuthoritativeSaleDay,
} from "../services/automotive/automotiveMetricsCore.js";
import { parseAutomotiveDashboardDateRange } from "../services/automotive/automotiveDateRange.js";

const COMPANY = "test-automotive-metrics-co";
const PERIOD = { from: "2026-10-01", to: "2026-10-31", timezonePolicy: "UTC", inclusiveEnd: true };

function inventoryOnlyLoaders(companyId) {
    return {
        listVehicles: () => listVehiclesByCompany(companyId),
        listLeads: async () => [],
        listAppointments: async () => [],
    };
}

test.beforeEach(() => {
    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
});

test("inventory counts use canonical availability buckets", async () => {
    await seedVehicles(COMPANY, [
        { stockNumber: "A1", make: "Toyota", availability: "available" },
        { stockNumber: "A2", make: "Toyota", availability: "reserved" },
        {
            stockNumber: "A3",
            make: "BMW",
            availability: "sold",
            metadata: { soldAt: "2026-10-15T10:00:00.000Z", salePrice: 240000 },
            price: 250000,
        },
        { stockNumber: "A4", make: "BMW", availability: "unavailable" },
    ]);

    const payload = await buildAutomotiveDashboardMetrics(
        COMPANY,
        { from: "2026-10-01", to: "2026-10-31" },
        Date.parse("2026-10-20T12:00:00.000Z"),
        inventoryOnlyLoaders(COMPANY)
    );

    assert.equal(payload.inventory.totals.value, 4);
    assert.equal(payload.inventory.byAvailability.available.value, 1);
    assert.equal(payload.sales.unitsSoldInPeriod.value, 1);
    assert.equal(payload.sales.realisedSalesValue.value, 240000);
    assert.equal(payload.sales.listingPriceSumForSoldInPeriod.notRealisedRevenue, true);
    assert.equal(payload.sales.listingPriceSumForSoldInPeriod.value, 250000);
});

test("sold vehicle updated after sale is not counted via updatedAt", async () => {
    await seedVehicles(COMPANY, [
        {
            stockNumber: "U1",
            availability: "sold",
            metadata: { soldAt: "2026-09-01T00:00:00.000Z" },
            updatedAt: "2026-10-20T00:00:00.000Z",
            price: 100,
        },
    ]);

    const payload = await buildAutomotiveDashboardMetrics(
        COMPANY,
        { from: "2026-10-01", to: "2026-10-31" },
        Date.now(),
        inventoryOnlyLoaders(COMPANY)
    );
    assert.equal(payload.sales.unitsSoldInPeriod.status, "empty");
    assert.equal(payload.sales.unitsSoldInPeriod.value, 0);
});

test("sold without sale timestamp excluded from period counts", async () => {
    await seedVehicles(COMPANY, [
        { stockNumber: "NS1", availability: "sold", updatedAt: "2026-10-15T00:00:00.000Z", price: 50000 },
    ]);

    const payload = await buildAutomotiveDashboardMetrics(
        COMPANY,
        { from: "2026-10-01", to: "2026-10-31" },
        Date.now(),
        inventoryOnlyLoaders(COMPANY)
    );
    assert.equal(payload.sales.unitsSoldInPeriod.value, 0);
    assert.equal(payload.sales.soldUnitsMissingSaleTimestamp.value, 1);
    assert.equal(resolveAuthoritativeSaleDay({ availability: "sold", updatedAt: "2026-10-15" }), null);
});

test("realised sales value unavailable when only listing price exists", async () => {
    const vehicles = [
        {
            stockNumber: "P1",
            availability: "sold",
            metadata: { soldAt: "2026-10-10T00:00:00.000Z" },
            price: 199999,
        },
    ];
    const payload = buildAutomotiveDashboardFromData({
        vehicles,
        leads: [],
        appointments: [],
        period: PERIOD,
        todayUtc: "2026-10-20",
        dataCompanyId: COMPANY,
        nowMs: Date.now(),
    });
    assert.equal(payload.sales.unitsSoldInPeriod.value, 1);
    assert.equal(payload.sales.realisedSalesValue.status, "unavailable");
    assert.equal(payload.sales.listingPriceSumForSoldInPeriod.value, 199999);
});

test("CRM won lead does not affect sales counts", async () => {
    const payload = buildAutomotiveDashboardFromData({
        vehicles: [],
        leads: [{ stage: "won", name: "CRM only" }],
        appointments: [],
        period: PERIOD,
        todayUtc: "2026-10-20",
        dataCompanyId: COMPANY,
        nowMs: Date.now(),
    });
    assert.equal(payload.crm.byStage.value.won, 1);
    assert.equal(payload.sales.unitsSoldInPeriod.value, 0);
});

test("appointments classify by appointmentType and exclude generic bookings", async () => {
    const payload = buildAutomotiveDashboardFromData({
        vehicles: [],
        leads: [],
        appointments: [
            {
                scheduledAt: "2026-10-22T14:00:00.000Z",
                status: "scheduled",
                appointmentType: "test_drive",
            },
            {
                scheduledAt: "2026-10-22T15:00:00.000Z",
                status: "scheduled",
                appointmentType: "consultation",
                service: "Finance consultation",
            },
        ],
        period: { from: "2026-10-22", to: "2026-10-22", timezonePolicy: "UTC", inclusiveEnd: true },
        todayUtc: "2026-10-22",
        dataCompanyId: COMPANY,
        nowMs: Date.parse("2026-10-22T08:00:00.000Z"),
    });

    assert.equal(payload.appointments.upcomingInPeriod.value, 2);
    assert.equal(payload.appointments.testDrivesInPeriod.value, 1);
});

test("empty inventory returns empty status not unavailable", async () => {
    const payload = await buildAutomotiveDashboardMetrics(
        COMPANY,
        { from: "2026-10-01", to: "2026-10-31" },
        Date.now(),
        inventoryOnlyLoaders(COMPANY)
    );
    assert.equal(payload.inventory.totals.status, "empty");
    assert.equal(payload.sales.unitsSoldInPeriod.status, "empty");
});

test("invalid date range is rejected", () => {
    assert.throws(() => parseAutomotiveDashboardDateRange({ from: "2026-10-10", to: "2026-10-01" }), /before/);
});

test("tenant isolation via loaders", async () => {
    await seedVehicles("company-a", [{ stockNumber: "X1", availability: "available" }]);
    await seedVehicles("company-b", [
        { stockNumber: "Y1", availability: "available" },
        { stockNumber: "Y2", availability: "available" },
    ]);

    const payload = await buildAutomotiveDashboardMetrics(
        "company-a",
        { from: "2026-10-01", to: "2026-10-31" },
        Date.now(),
        inventoryOnlyLoaders("company-a")
    );
    assert.equal(payload.inventory.totals.value, 1);
});
