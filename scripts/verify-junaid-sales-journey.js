#!/usr/bin/env node
/**
 * Regression: Junaid sales journey — monthly vs purchase budget, vehicleId continuity, test drive.
 *
 * Usage:
 *   node scripts/verify-junaid-sales-journey.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function futureSlotIso(daysAhead = 5, hour = 11) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

async function simulateTurn({ companyId, phone, text, salesContext, persistSalesContext, extractSalesSignals, mergeSalesContext, getCustomer }) {
    const customer = await getCustomer(phone, { companyId });
    const signals = extractSalesSignals(text, { customer: { ...customer, salesContext } });
    if (Object.keys(signals).length) {
        salesContext = mergeSalesContext(salesContext, signals);
        await persistSalesContext(companyId, phone, signals);
    }
    return salesContext;
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryAppointmentsForTests } = await import("../services/database/appointmentRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles, upsertVehicle } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const { parseExplicitCustomerName, persistExplicitCustomerName, getCustomer } = await import(
        "../services/customerService.js"
    );
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        extractSalesSignals,
        persistSalesContext,
        mergeSalesContext,
        getActivePurchaseBudgetFilter,
        formatSalesContextForPrompt,
    } = await import("../services/conversation/salesContext.js");
    const {
        resolveVehicleReference,
        isVehicleReferenceIntent,
        formatResolvedVehicleBlock,
    } = await import("../services/conversation/vehicleReference.js");

    resetMemoryTenantStore();
    _resetMemoryAppointmentsForTests();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-junaid-co";
    const PHONE = "27810000999";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Junaid",
        agentId: "agent-junaid",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-bmw-001",
            stockNumber: "CM-BMW-001",
            make: "BMW",
            model: "X5 xDrive30d M Sport",
            year: 2019,
            price: 699900,
            mileage: 62000,
            location: "Central Motors Sandton",
            availability: "available",
            title: "2019 BMW X5 xDrive30d M Sport",
            metadata: { seatingCapacity: 5, bodyType: "SUV" },
        },
        {
            vehicleId: "veh-ftn-001",
            stockNumber: "CM-FTN-001",
            make: "Toyota",
            model: "Fortuner 2.4 GD-6",
            year: 2020,
            price: 399900,
            location: "Central Motors Sandton",
            availability: "available",
            title: "2020 Toyota Fortuner 2.4 GD-6",
            metadata: { seatingCapacity: 7, bodyType: "SUV" },
        },
        {
            vehicleId: "veh-hlx-002",
            stockNumber: "CM-HLX-002",
            make: "Toyota",
            model: "Hilux 2.4 GD-6 Double Cab SRX",
            year: 2020,
            price: 425000,
            location: "Central Motors Sandton",
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
            metadata: { seatingCapacity: 5 },
        },
    ]);

    let salesContext = {};

    /* 1. Junaid identified */
    assert(parseExplicitCustomerName("My name is Junaid") === "Junaid", "parse Junaid");
    await persistExplicitCustomerName(PHONE, "Junaid", { companyId: COMPANY_ID, companyName: "Central Motors" });
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My name is Junaid",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    console.log("✓ 1. Junaid identified");

    /* 2. Monthly budget R5500/pm captured separately */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I can afford about R5,500 per month",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.monthlyBudget === 5500, `monthlyBudget 5500, got ${salesContext.monthlyBudget}`);
    assert(!salesContext.purchaseBudget, "monthly budget must NOT set purchase budget");
    assert(formatSalesContextForPrompt({ salesContext }).includes("Monthly affordability"), "prompt shows monthly");
    console.log("✓ 2. monthly budget R5500/pm captured separately");

    /* 3. Purchase budget R300k */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My budget is R300,000 for the purchase",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.purchaseBudget === 300000, `purchaseBudget 300k, got ${salesContext.purchaseBudget}`);
    assert(salesContext.monthlyBudget === 5500, "monthly budget preserved alongside purchase");
    console.log("✓ 3. purchase budget R300k captured");

    /* 4. SUV preference */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I'm looking for an SUV",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.vehiclePreferences?.includes("SUV"), "SUV preference captured");
    console.log("✓ 4. SUV preference captured");

    /* 5. Budget search under R300k — BMW excluded */
    const budgetSearch = await runTool(
        "searchInventory",
        { ...ctx, salesContext },
        { query: "SUV", maxPrice: 300000 }
    );
    assert(budgetSearch.ok, "budget search ok");
    assert(!budgetSearch.vehicles?.some((v) => v.stockNumber === "CM-BMW-001"), "BMW excluded at R300k");
    console.log("✓ 5. R300k filter excludes BMW X5");

    /* 6. Budget transition R500k+ */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "Actually I can go over R500,000",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.previousPurchaseBudget === 300000, "previous budget tracked");
    assert(salesContext.purchaseBudgetDisplay?.endsWith("+"), "new budget is R500k+");
    const activeFilter = getActivePurchaseBudgetFilter(salesContext);
    assert(activeFilter.minPrice === 500000, "active filter uses new min price, not old R300k max");
    console.log("✓ 6. budget transition R300k → R500k+ replaces old constraint");

    /* 7. BMW recommendation with stable vehicleId */
    const bmwSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "BMW X5 SUV" });
    assert(bmwSearch.ok, "BMW search ok");
    const bmw = bmwSearch.vehicles?.find((v) => v.stockNumber === "CM-BMW-001");
    assert(bmw?.vehicleId === "veh-bmw-001", "BMW has stable vehicleId");
    assert(bmw?.price === 699900, "BMW price from inventory");

    let customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    salesContext = customer.salesContext || salesContext;
    assert(
        salesContext.lastRecommendedVehicles?.some((v) => v.vehicleId === "veh-bmw-001"),
        "BMW stored in salesContext.lastRecommendedVehicles"
    );
    console.log("✓ 7. BMW X5 recommended with stable vehicleId CM-BMW-001 / veh-bmw-001");

    /* 8. Customer asks details — resolves same vehicleId (not new search) */
    const detailsText = "Tell me more about the BMW X5 you recommended";
    assert(isVehicleReferenceIntent(detailsText), "details message is vehicle reference");
    const resolved = resolveVehicleReference(detailsText, salesContext, bmwSearch.vehicles);
    assert(resolved?.vehicleId === "veh-bmw-001", `resolved vehicleId veh-bmw-001, got ${resolved?.vehicleId}`);
    assert(formatResolvedVehicleBlock(resolved).includes("veh-bmw-001"), "resolved block has vehicleId");
    console.log("✓ 8. 'the BMW you recommended' resolves to same vehicleId");

    /* 9. Test drive request — vehicle still available (success path) */
    const availText = "I'd like to book a test drive for the BMW you recommended on Friday at 2pm";
    const availResolved = resolveVehicleReference(availText, salesContext, bmwSearch.vehicles);
    assert(availResolved?.vehicleId === "veh-bmw-001", "test drive reference resolves to BMW");

    const availability = await runTool(
        "checkTestDriveAvailability",
        {
            ...ctx,
            salesContext,
            inboundMessage: availText,
            resolvedVehicleReference: availResolved,
            lastRecommendedVehicles: bmwSearch.vehicles,
        },
        { scheduledAt: futureSlotIso(6, 14) }
    );
    assert(availability.ok === true, `availability ok: ${availability.reason || availability.error}`);
    assert(availability.vehicle?.vehicleId === "veh-bmw-001", "availability checks same BMW vehicleId");
    console.log("✓ 9. test drive availability succeeds for same vehicleId");

    const booked = await runTool(
        "bookTestDrive",
        {
            ...ctx,
            salesContext,
            inboundMessage: availText,
            resolvedVehicleReference: availResolved,
            lastRecommendedVehicles: bmwSearch.vehicles,
            customerName: "Junaid",
        },
        { vehicleId: "veh-bmw-001", scheduledAt: futureSlotIso(6, 14), customerName: "Junaid" }
    );
    assert(booked.ok === true, `book test drive: ${booked.error || ""}`);
    assert(booked.vehicleId === "veh-bmw-001", "booking uses veh-bmw-001");
    console.log("✓ 10. test drive booked with canonical vehicleId");

    /* 10. Vehicle sold between recommend and book — graceful message with stock number */
    _resetMemoryAppointmentsForTests();
    await upsertVehicle({
        companyId: COMPANY_ID,
        vehicleId: "veh-bmw-001",
        stockNumber: "CM-BMW-001",
        make: "BMW",
        model: "X5 xDrive30d M Sport",
        year: 2019,
        price: 699900,
        availability: "sold",
        title: "2019 BMW X5 xDrive30d M Sport",
    });

    const soldCheck = await runTool(
        "checkTestDriveAvailability",
        {
            ...ctx,
            salesContext,
            inboundMessage: "Can I test drive the BMW you recommended?",
            resolvedVehicleReference: availResolved,
        },
        { vehicleId: "veh-bmw-001", scheduledAt: futureSlotIso(7, 10) }
    );
    assert(soldCheck.ok === false, "sold vehicle should fail availability");
    assert(soldCheck.code === "INVENTORY_UNAVAILABLE", `code INVENTORY_UNAVAILABLE, got ${soldCheck.code}`);
    assert(/CM-BMW-001/i.test(soldCheck.reason || ""), `reason mentions stock: ${soldCheck.reason}`);
    assert(/no longer available/i.test(soldCheck.reason || ""), "reason says no longer available");
    console.log("✓ 11. sold vehicle returns explicit stock-number message with alternatives");

    console.log("\nAll Junaid sales journey verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
