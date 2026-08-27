#!/usr/bin/env node
/**
 * Regression: Spencer/Palesa family sales journey — identity, budget, inventory, seating, booking.
 *
 * Usage:
 *   node scripts/verify-sales-family-decision-journey.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

import { futureSlotIso } from "./testHelpers/scheduling.js";

async function simulateTurn({ companyId, phone, text, ctx, salesContext, persistSalesContext, extractSalesSignals, mergeSalesContext, getCustomer }) {
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
    const { _resetMemoryInventoryForTests, seedVehicles } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { _resetMemoryCustomersForTests, _reinitCustomerRepositoryForTests } = await import(
        "../services/database/customerRepository.js"
    );
    const {
        parseExplicitCustomerName,
        persistExplicitCustomerName,
        getCustomer,
        getCustomerDisplayName,
        parseIntroducedPerson,
    } = await import("../services/customerService.js");
    const { buildWhatsAppSystemPrompt, WHATSAPP_SALES_TRUTH_RULES } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const { countPassengersFromText, evaluateSeatingFit } = await import("../services/inventory/seatingCapacity.js");
    const {
        extractSalesSignals,
        persistSalesContext,
        mergeSalesContext,
        formatSalesContextForPrompt,
    } = await import("../services/conversation/salesContext.js");

    resetMemoryTenantStore();
    _resetMemoryAppointmentsForTests();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-sales-family-co";
    const COMPANY_NAME = "Central Motors";
    const PHONE = "27810000888";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Spencer",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-hlx-002",
            stockNumber: "CM-HLX-002",
            make: "Toyota",
            model: "Hilux 2.4 GD-6 Double Cab SRX",
            year: 2020,
            price: 425000,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
            metadata: { seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-ftn-001",
            stockNumber: "CM-FTN-001",
            make: "Toyota",
            model: "Fortuner 2.4 GD-6",
            year: 2020,
            price: 399900,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2020 Toyota Fortuner 2.4 GD-6",
            metadata: { seatingCapacity: 7 },
        },
        {
            vehicleId: "veh-frd-001",
            stockNumber: "CM-FRD-001",
            make: "Ford",
            model: "Everest 2.0 Bi-Turbo XLT",
            year: 2021,
            price: 449900,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2021 Ford Everest 2.0 Bi-Turbo XLT",
            metadata: { seatingCapacity: 7 },
        },
        {
            vehicleId: "veh-bmw-001",
            stockNumber: "CM-BMW-001",
            make: "BMW",
            model: "X5 xDrive30d M Sport",
            year: 2019,
            price: 699900,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2019 BMW X5 xDrive30d M Sport",
            metadata: { seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-lc-001",
            stockNumber: "CM-LC-001",
            make: "Toyota",
            model: "Land Cruiser 200 VX",
            year: 2020,
            price: 899900,
            location: "Central Motors Sandton, 42 Main Road",
            availability: "available",
            title: "2020 Toyota Land Cruiser 200 VX",
            metadata: { seatingCapacity: 8 },
        },
    ]);

    let salesContext = {};

    /* 1. Spencer identified */
    assert(parseExplicitCustomerName("My name is Spencer") === "Spencer", "parse Spencer");
    await persistExplicitCustomerName(PHONE, "Spencer", { companyId: COMPANY_ID, companyName: COMPANY_NAME });
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My name is Spencer",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.leadStage === "IDENTIFIED", `stage IDENTIFIED, got ${salesContext.leadStage}`);
    let customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", "Spencer stored");
    console.log("✓ 1. Spencer identified");

    /* 2. R460k budget captured */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My budget is R460,000",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.budget === 460000, `budget 460000, got ${salesContext.budget}`);
    assert(salesContext.budgetDisplay === "R460,000", `budget display, got ${salesContext.budgetDisplay}`);
    console.log("✓ 2. R460k budget captured");

    /* 3. Vehicle recommendations from inventory (budget filter) */
    const budgetSearch = await runTool(
        "searchInventory",
        { ...ctx, salesContext },
        { query: "Toyota SUV family", maxPrice: 460000 }
    );
    assert(budgetSearch.ok === true, "budget search ok");
    assert(budgetSearch.vehicles?.length >= 1, "inventory results for budget");
    assert(budgetSearch.vehicles.every((v) => v.stockNumber), "all results have stock numbers");
    console.log("✓ 3. inventory recommendations within budget");

    /* 4. BMW/Honda query — BMW in stock; Honda not fabricated but alternatives offered */
    const bmwSearch = await runTool("searchInventory", ctx, { query: "BMW X5" });
    assert(bmwSearch.vehicles?.some((v) => v.make === "BMW"), "BMW X5 in inventory");
    const hondaSearch = await runTool("searchInventory", ctx, { query: "Honda" });
    assert(!hondaSearch.vehicles?.some((v) => /honda/i.test(v.make || "")), "Honda not in stock — no fabricated Honda listing");
    assert(hondaSearch.count >= 1, "Honda absent — fallback must still offer in-stock alternatives");
    assert(hondaSearch.fallbackSearch != null, "fallback search when requested brand unavailable");
    console.log("✓ 4. BMW in inventory; Honda absent with never-dead-end alternatives");

    /* 5. Vehicle recommendation — Fortuner from inventory */
    const fortunerSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "Fortuner", maxPrice: 460000 });
    assert(fortunerSearch.vehicles?.some((v) => /fortuner/i.test(v.model || "")), "Fortuner from inventory");
    const fortuner = fortunerSearch.vehicles.find((v) => v.stockNumber === "CM-FTN-001");
    assert(fortuner?.seatingCapacity === 7, "Fortuner seating capacity exposed");
    console.log("✓ 5. Fortuner recommended from verified inventory");

    /* 6. Test drive booked for Hilux (original preference) */
    salesContext = mergeSalesContext(salesContext, { preferredVehicle: "Hilux", leadStage: "TEST_DRIVE_BOOKED" });
    const booked = await runTool(
        "bookTestDrive",
        { ...ctx, salesContext, customerName: "Spencer" },
        {
            vehicleStockNumber: "CM-HLX-002",
            scheduledAt: futureSlotIso(6, 10),
            customerName: "Spencer",
        }
    );
    assert(booked.ok === true, `book Hilux: ${booked.error || ""}`);
    assert(booked.appointment?.stockNumber === "CM-HLX-002", "Hilux booking stock");
    const originalBookingId = booked.appointment?.bookingId || booked.appointment?.id;
    console.log("✓ 6. test drive booked for Hilux CM-HLX-002");

    /* 7. Spouse Palesa introduced — same household */
    const palesaIntro = parseIntroducedPerson("My wife wants to talk, her name is Palesa");
    assert(palesaIntro?.name === "Palesa", "Palesa parsed from spouse intro");
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My wife wants to talk, her name is Palesa",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", "Spencer remains primary customer after spouse intro");
    assert(
        salesContext.household?.some((m) => m.name === "Palesa"),
        "Palesa in household context"
    );
    assert(salesContext.decisionMakers?.includes("Palesa"), "Palesa is decision-maker");
    console.log("✓ 7. Palesa linked to same household — Spencer retained as primary");

    /* 8. Family size = 8 captured */
    const familyText = "We have 6 kids plus Spencer and Palesa = 8 people";
    const familySize = countPassengersFromText(familyText);
    assert(familySize === 8, `family size 8, got ${familySize}`);
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: familyText,
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
        getCustomer,
    });
    assert(salesContext.familySize === 8, `familySize persisted as 8, got ${salesContext.familySize}`);
    console.log("✓ 8. family size 8 captured");

    /* 9. Fortuner correctly rejected for 8 passengers */
    const fortunerFit = evaluateSeatingFit(8, fortuner);
    assert(fortunerFit.fits === false, "Fortuner must not fit 8 passengers");
    assert(fortunerFit.capacity === 7, "Fortuner capacity is 7");
    assert(/not enough/i.test(fortunerFit.warning || ""), "Fortuner warning present");

    const fortunerWithFamily = await runTool(
        "searchInventory",
        { ...ctx, salesContext: { familySize: 8 } },
        { query: "Fortuner", maxPrice: 460000 }
    );
    const ftnResult = fortunerWithFamily.vehicles?.find((v) => v.stockNumber === "CM-FTN-001");
    assert(ftnResult?.seatingFit === "insufficient", "searchInventory flags Fortuner insufficient for 8");
    console.log("✓ 9. Fortuner correctly flagged too small for family of 8");

    /* 10. Larger vehicle from inventory (8-seater Land Cruiser) */
    const largeSearch = await runTool(
        "searchInventory",
        { ...ctx, salesContext: { familySize: 8 } },
        { query: "Land Cruiser", minSeats: 8 }
    );
    assert(largeSearch.vehicles?.some((v) => v.stockNumber === "CM-LC-001"), "8-seater Land Cruiser in stock");
    const lcFit = evaluateSeatingFit(8, largeSearch.vehicles.find((v) => v.stockNumber === "CM-LC-001"));
    assert(lcFit.fits === true, "Land Cruiser fits 8");
    console.log("✓ 10. larger 8-seater recommended from verified inventory");

    /* 11. Customer returns to original Hilux — booking retained */
    const recap = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
    assert(recap.upcoming.some((b) => b.stockNumber === "CM-HLX-002"), "original Hilux booking still upcoming");
    assert(recap.upcoming.some((b) => (b.bookingId || b.id) === originalBookingId), "same booking id retained");
    salesContext = mergeSalesContext(salesContext, { preferredVehicle: "Hilux" });
    console.log("✓ 11. original Hilux booking retained after family detour");

    /* 12. Customer identity retained after restart */
    _reinitCustomerRepositoryForTests();
    resetMemoryTenantStore();
    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer?.displayName === "Spencer", "Spencer survives restart");
    assert(
        getCustomerDisplayName(customer, { companyName: COMPANY_NAME }) === "Spencer",
        "display name Spencer after restart"
    );

    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: COMPANY_NAME,
        customer: { ...customer, salesContext },
        agent: { name: "Sarah", systemPrompt: "You are Sarah at Central Motors." },
    });
    assert(prompt.includes("Customer name: Spencer"), "prompt uses Spencer");
    assert(prompt.includes("SEATING CAPACITY"), "prompt includes seating rules");
    assert(prompt.includes("TRUTH HIERARCHY"), "prompt includes truth hierarchy rules");
    assert(WHATSAPP_SALES_TRUTH_RULES.includes("HUMAN HANDOFF"), "handoff rule exported");
    assert(formatSalesContextForPrompt({ salesContext }).includes("Family / passenger count: 8"), "sales context in prompt");
    console.log("✓ 12. Spencer identity + sales context survive restart; prompt rules present");

    console.log("\nAll sales family decision journey verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
