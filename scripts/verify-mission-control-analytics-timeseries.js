#!/usr/bin/env node
/**
 * B-MC-4b-1 — Mission Control tenant analytics time-series verification.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetMemoryTenantStore, TenantRepository } from "../services/database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";
import { createAppointmentRecord, _resetMemoryAppointmentsForTests } from "../services/database/appointmentRepository.js";
import {
    getTenantAnalyticsTimeSeries,
    parseTimeSeriesQuery,
    TimeSeriesValidationError,
    defaultDateRange,
    daySpanInclusive,
} from "../services/operations/tenantTimeSeries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RTB = CENTRAL_MOTORS_RTB_COMPANY_ID;
const DEMO = CENTRAL_MOTORS_COMPANY_ID;

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertThrows(fn, messageIncludes) {
    try {
        fn();
        throw new Error("Expected validation error");
    } catch (err) {
        assert.ok(err instanceof TimeSeriesValidationError, "Expected TimeSeriesValidationError");
        if (messageIncludes) {
            assert.match(err.message, new RegExp(messageIncludes, "i"));
        }
        assert.equal(err.statusCode, 400);
    }
}

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

async function seedTimeSeriesFixture() {
    resetMemoryTenantStore();
    _resetMemoryAppointmentsForTests();

    const messagesRepo = new TenantRepository(TENANT_COLLECTIONS.MESSAGES);
    const conversationsRepo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
    const customersRepo = new TenantRepository(TENANT_COLLECTIONS.CUSTOMERS);

    await customersRepo.set(RTB, "27849000523", {
        customerId: "27849000523",
        phone: "27849000523",
        totalMessages: 176,
    });

    for (let i = 0; i < 85; i += 1) {
        await messagesRepo.set(RTB, `msg-rtb-0903-${i}`, {
            conversationId: "whatsapp::27849000523",
            customerId: "27849000523",
            channel: "whatsapp",
            role: i % 2 === 0 ? "user" : "assistant",
            createdAt: `2026-09-03T${String(10 + (i % 10)).padStart(2, "0")}:00:00.000Z`,
        });
    }
    for (let i = 0; i < 23; i += 1) {
        await messagesRepo.set(RTB, `msg-rtb-0904-${i}`, {
            conversationId: "whatsapp::27849000523",
            customerId: "27849000523",
            channel: "whatsapp",
            role: "assistant",
            createdAt: `2026-09-04T${String(8 + (i % 5)).padStart(2, "0")}:00:00.000Z`,
        });
    }

    await conversationsRepo.set(RTB, "whatsapp::27849000523", {
        conversationId: "whatsapp::27849000523",
        customerId: "27849000523",
        channel: "whatsapp",
        createdAt: "2026-09-03T16:28:51.414Z",
        updatedAt: "2026-09-04T10:00:00.000Z",
    });
    await conversationsRepo.set(RTB, "whatsapp::27849999999", {
        conversationId: "whatsapp::27849999999",
        customerId: "27849999999",
        channel: "whatsapp",
        createdAt: "not-a-valid-timestamp",
        updatedAt: "2026-09-04T11:00:00.000Z",
    });

    const appointmentDays = [
        ["2026-08-25", 3],
        ["2026-08-26", 2],
        ["2026-08-28", 1],
        ["2026-08-30", 1],
        ["2026-09-03", 3],
        ["2026-09-04", 1],
    ];
    let apptIndex = 0;
    for (const [day, count] of appointmentDays) {
        for (let i = 0; i < count; i += 1) {
            apptIndex += 1;
            await createAppointmentRecord({
                companyId: RTB,
                customerId: "27849000523",
                appointmentType: "test_drive",
                scheduledAt: `${day}T12:00:00.000Z`,
                idempotencyKey: `verify-ts-appt-${day}-${i}`,
                status: "confirmed",
                metadata: { seededCreatedDay: day },
            });
        }
    }

    await messagesRepo.set(DEMO, "demo-msg-1", {
        conversationId: "whatsapp::27000000001",
        customerId: "27000000001",
        channel: "whatsapp",
        role: "user",
        createdAt: "2026-09-03T12:00:00.000Z",
    });
}

function testStaticRouteAndAuth() {
    const appSource = read("api/app.js");
    const registry = read("services/api/routeRegistry.js");
    const serviceSource = read("services/operations/tenantTimeSeries.js");

    assert.match(
        appSource,
        /\/api\/operations\/tenant\/:companyId\/analytics\/timeseries/
    );
    assert.match(appSource, /requirePlatformAccess\(\)/);
    assert.match(registry, /analytics\/timeseries/);
    assert.match(serviceSource, /messageDocuments/);
    assert.doesNotMatch(serviceSource, /getDailyAggregates|queueAggregateUpdate|ingestEvent|analyticsDaily\//);
    assert.doesNotMatch(serviceSource, /TENANT_COLLECTIONS\.ANALYTICS|LEGACY_COLLECTIONS\.ANALYTICS/);
    console.log("✓ Route registered with requirePlatformAccess and read-only service boundaries");
}

async function testAuthenticationGate() {
    const testKey = "verify-bmc4b1-platform-key";
    process.env.PLATFORM_API_KEY = testKey;
    const { requirePlatformAccess } = await import("../services/auth/platformAuth.js");
    const middleware = requirePlatformAccess();

    const unauthReq = {
        headers: {},
        path: `/api/operations/tenant/${RTB}/analytics/timeseries`,
        method: "GET",
    };
    const unauthRes = mockRes();
    let passed = false;
    await middleware(unauthReq, unauthRes, () => {
        passed = true;
    });
    assert.equal(passed, false);
    assert.equal(unauthRes.statusCode, 401);
    console.log("✓ Authentication is enforced for time-series route");
}

function testDateValidation() {
    assertThrows(() => parseTimeSeriesQuery({ startDate: "2026-13-01", endDate: "2026-09-05" }), "valid calendar date");
    assertThrows(() => parseTimeSeriesQuery({ startDate: "2026-09-05", endDate: "2026-09-01" }), "on or before");
    assertThrows(() => parseTimeSeriesQuery({ startDate: "2026-01-01", endDate: "2026-05-01" }), "90 calendar days");
    assertThrows(() => parseTimeSeriesQuery({ series: "messages,unknownSeries" }), "Unknown series");

    const defaults = parseTimeSeriesQuery({});
    assert.equal(daySpanInclusive(defaults.startDate, defaults.endDate), 14);
    assert.deepEqual(defaults.series, ["messages", "conversationsCreated", "testDrivesBooked"]);

    const ninety = parseTimeSeriesQuery({ startDate: "2026-06-08", endDate: "2026-09-05" });
    assert.equal(daySpanInclusive(ninety.startDate, ninety.endDate), 90);
    console.log("✓ Date and series validation behaves correctly");
}

async function testAggregation() {
    await seedTimeSeriesFixture();

    const fullRange = await getTenantAnalyticsTimeSeries(RTB, {
        startDate: "2026-08-23",
        endDate: "2026-09-05",
        series: ["messages", "conversationsCreated", "testDrivesBooked"],
    });

    assert.equal(fullRange.companyId, RTB);
    assert.equal(fullRange.timezone, "UTC");
    assert.equal(fullRange.bucketKey, "YYYY-MM-DD");
    assert.equal(fullRange.series.messages.length, daySpanInclusive("2026-08-23", "2026-09-05"));

    const msgByDay = Object.fromEntries(fullRange.series.messages.map((row) => [row.date, row.value]));
    assert.equal(msgByDay["2026-09-03"], 85);
    assert.equal(msgByDay["2026-09-04"], 23);
    assert.equal(fullRange.meta.messages.metric, "messageDocuments");
    assert.equal(fullRange.meta.messages.totalInRange, 108);
    assert.equal(fullRange.meta.messages.complete, true);

    assert.equal(fullRange.kpis.messagesTotal.value, 176);
    assert.equal(fullRange.kpis.messagesTotal.source, "crm:customer.totalMessages");
    assert.notEqual(fullRange.meta.messages.totalInRange, fullRange.kpis.messagesTotal.value);

    const convByDay = Object.fromEntries(fullRange.series.conversationsCreated.map((row) => [row.date, row.value]));
    assert.equal(convByDay["2026-09-03"], 1);
    assert.equal(fullRange.meta.conversationsCreated.invalidTimestampCount, 1);
    assert.equal(fullRange.meta.conversationsCreated.complete, false);

    const apptTotal = fullRange.series.testDrivesBooked.reduce((sum, row) => sum + row.value, 0);
    assert.equal(apptTotal, 11);
    assert.equal(fullRange.meta.testDrivesBooked.totalInRange, 11);
    assert.equal(fullRange.meta.testDrivesBooked.metric, "testDrivesBooked");
    assert.equal(fullRange.meta.testDrivesBooked.source, "postgres:ziricai_appointments.created_at");

    const defaults = await getTenantAnalyticsTimeSeries(RTB, parseTimeSeriesQuery({}));
    assert.ok(defaults.series.messages);
    assert.ok(defaults.series.conversationsCreated);
    assert.ok(defaults.series.testDrivesBooked);

    const messagesOnly = await getTenantAnalyticsTimeSeries(RTB, {
        startDate: "2026-09-03",
        endDate: "2026-09-04",
        series: ["messages"],
    });
    assert.ok(messagesOnly.series.messages);
    assert.equal(messagesOnly.series.conversationsCreated, undefined);
    assert.equal(messagesOnly.series.testDrivesBooked, undefined);

    const demoRange = await getTenantAnalyticsTimeSeries(DEMO, {
        startDate: "2026-09-03",
        endDate: "2026-09-03",
        series: ["messages"],
    });
    assert.equal(demoRange.meta.messages.totalInRange, 1);

    const rtbSameDay = await getTenantAnalyticsTimeSeries(RTB, {
        startDate: "2026-09-03",
        endDate: "2026-09-03",
        series: ["messages"],
    });
    assert.equal(rtbSameDay.meta.messages.totalInRange, 85);
    assert.notEqual(demoRange.meta.messages.totalInRange, rtbSameDay.meta.messages.totalInRange);

    console.log("✓ Time-series aggregation, KPI separation, and tenant isolation verified");
}

async function testNoWrites() {
    const messagesRepo = new TenantRepository(TENANT_COLLECTIONS.MESSAGES);
    const before = (await messagesRepo.list(RTB, { max: 500 })).length;
    await getTenantAnalyticsTimeSeries(RTB, {
        startDate: "2026-09-03",
        endDate: "2026-09-04",
        series: ["messages", "conversationsCreated", "testDrivesBooked"],
    });
    const after = (await messagesRepo.list(RTB, { max: 500 })).length;
    assert.equal(before, after);
    console.log("✓ Aggregator performs no writes");
}

async function main() {
    console.log("verify-mission-control-analytics-timeseries\n");
    testStaticRouteAndAuth();
    await testAuthenticationGate();
    testDateValidation();
    await testAggregation();
    await testNoWrites();
    console.log("\nAll B-MC-4b-1 time-series verification checks passed.");
}

main().catch((err) => {
    console.error("FAILED:", err.message);
    console.error(err.stack);
    process.exit(1);
});
