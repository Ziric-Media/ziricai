#!/usr/bin/env node
/**
 * Phase 1.1 UAT regression — family count, salary vs budget, forget budget, outbound sync.
 *
 * Usage:
 *   node scripts/verify-phase-1-1-context.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function simulateTurn({ companyId, phone, text, salesContext, persistSalesContext, extractSalesSignals, mergeSalesContext }) {
    const signals = extractSalesSignals(text, { customer: { salesContext } });
    if (Object.keys(signals).length) {
        salesContext = mergeSalesContext(salesContext, signals);
        await persistSalesContext(companyId, phone, signals);
    }
    return salesContext;
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        extractSalesSignals,
        persistSalesContext,
        mergeSalesContext,
        getActivePurchaseBudgetFilter,
    } = await import("../services/conversation/salesContext.js");
    const { countPassengersFromText } = await import("../services/inventory/seatingCapacity.js");
    const { parseIntroducedPerson } = await import("../services/customerIdentity.js");
    const { buildVehicleOutboundPlan, MAX_VEHICLE_IMAGES_PER_TURN } = await import(
        "../services/conversation/vehicleOutboundPlan.js"
    );

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-phase-1-1-co";
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
            vehicleId: "veh-rav4-a",
            stockNumber: "CM-RAV4-A",
            make: "Toyota",
            model: "RAV4 2.0 GX",
            year: 2020,
            price: 389900,
            mileage: 62000,
            availability: "available",
            title: "2020 Toyota RAV4 2.0 GX",
            metadata: { bodyType: "SUV", seatingCapacity: 5 },
            images: ["https://example.com/rav4-a.jpg"],
        },
        {
            vehicleId: "veh-everest",
            stockNumber: "CM-EVEREST",
            make: "Ford",
            model: "Everest 2.0 Bi-Turbo XLT",
            year: 2021,
            price: 449900,
            mileage: 55000,
            availability: "available",
            title: "2021 Ford Everest 2.0 Bi-Turbo XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
            images: ["https://example.com/everest.jpg"],
        },
        {
            vehicleId: "veh-rav4-b",
            stockNumber: "CM-RAV4-B",
            make: "Toyota",
            model: "RAV4 2.5 AWD",
            year: 2019,
            price: 359900,
            mileage: 78000,
            availability: "available",
            title: "2019 Toyota RAV4 2.5 AWD",
            metadata: { bodyType: "SUV", seatingCapacity: 5 },
            images: ["https://example.com/rav4-b.jpg"],
        },
        {
            vehicleId: "veh-bmw",
            stockNumber: "CM-BMW",
            make: "BMW",
            model: "X5 xDrive30d",
            year: 2022,
            price: 899900,
            mileage: 38000,
            availability: "available",
            title: "2022 BMW X5 xDrive30d",
            metadata: { bodyType: "SUV", seatingCapacity: 5 },
            images: ["https://example.com/x5.jpg"],
        },
    ]);

    let salesContext = {};

    /* 1. Family size — 3 kids + wife Palesa = 5, not 23 or 8 */
    const familyText = "3 kids and my wife Palesa";
    assert(countPassengersFromText(familyText) === 5, `family count 5, got ${countPassengersFromText(familyText)}`);
    assert(
        countPassengersFromText("I earn R25,000 per month. 3 kids and my wife Palesa") === 5,
        "salary in same message must not inflate passenger count"
    );
    assert(
        countPassengersFromText("My salary is R25k and I have 3 kids and my wife Palesa") === 5,
        "R25k salary must not inflate passenger count"
    );

    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: familyText,
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.familySize === 5, `familySize=5, got ${salesContext.familySize}`);
    const palesa = parseIntroducedPerson(familyText);
    assert(palesa?.name === "Palesa", `Palesa parsed, got ${palesa?.name}`);
    console.log("✓ 1. Family size 5 (3 kids + wife + customer) — not inflated by salary words");

    /* 2. R25k income alone — no maxPrice filter */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I earn R25,000 per month",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.income === 25000, `income 25000, got ${salesContext.income}`);
    assert(salesContext.confirmedPurchaseBudget == null, "salary must not set purchase budget");
    assert(getActivePurchaseBudgetFilter(salesContext).maxPrice == null, "no maxPrice from income");

    const incomeSearch = await runTool(
        "searchInventory",
        { ...ctx, salesContext },
        { query: "SUV", maxPrice: 25000, limit: 10 }
    );
    assert(incomeSearch.ok && incomeSearch.count >= 1, "income-only context must not zero inventory via LLM maxPrice");
    assert(
        incomeSearch.vehicles.some((v) => v.stockNumber === "CM-BMW"),
        "BMW over 25k included when no confirmed purchase budget"
    );
    console.log("✓ 2. R25k income alone — no maxPrice inventory filter");

    /* 3. Forget my budget — clears budget, keeps family, full search */
    salesContext = mergeSalesContext(salesContext, {
        confirmedPurchaseBudget: 250000,
        confirmedPurchaseBudgetDisplay: "R250000",
        estimatedPurchaseBudget: 250000,
        estimatedPurchaseBudgetDisplay: "R250000",
    });
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "Forget my budget",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.budgetOpen === true, "budgetOpen after forget");
    assert(salesContext.confirmedPurchaseBudget == null, "confirmed budget cleared");
    assert(salesContext.estimatedPurchaseBudget == null, "estimated budget cleared");
    assert(salesContext.familySize === 5, "familySize preserved after forget budget");

    const openSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "SUV", limit: 10 });
    assert(openSearch.ok && openSearch.count >= 1, "full inventory search after forget budget");
    console.log("✓ 3. Forget my budget clears price constraint, keeps familySize");

    /* 4. Outbound plan matches search results — max 3, deduped IDs */
    const searchResult = await runTool("searchInventory", { ...ctx, salesContext }, { query: "SUV", limit: 5 });
    const duplicateResults = [
        {
            tool: "searchInventory",
            ok: true,
            vehicles: [
                searchResult.vehicles[0],
                searchResult.vehicles[1],
                searchResult.vehicles[0],
            ],
        },
    ];
    const llmReply =
        "Here are two great SUV options for your family:\n\n" +
        "1. 2020 Toyota RAV4 — R389,900 · 62,000 km\n" +
        "2. 2021 Ford Everest — R449,900 · 55,000 km\n" +
        "3. 2020 Toyota RAV4 again";

    const plan = buildVehicleOutboundPlan({
        toolResults: duplicateResults,
        llmReply,
        channel: "whatsapp",
    });
    assert(plan != null, "outbound plan expected");
    assert(plan.vehicleCount === 2, `deduped vehicle count 2, got ${plan.vehicleCount}`);
    assert(plan.vehicleCount <= MAX_VEHICLE_IMAGES_PER_TURN, "capped at max per turn");
    assert(new Set(plan.vehicleIds).size === plan.vehicleIds.length, "vehicleIds must be unique");
    assert(!plan.strippedReply.includes("R389"), "LLM vehicle price lines stripped from intro");
    assert(plan.strippedReply.includes("great SUV options"), "intro prose retained");

    const vehicleTextBlocks = plan.messages.filter((m) => m.type === "text" && m.text.includes("Stock:"));
    assert(vehicleTextBlocks.length === plan.vehicleCount, "one text block per outbound vehicle");
    console.log("✓ 4. Outbound plan canonical — deduped, max 3, intro-only LLM");

    console.log("\nAll Phase 1.1 context verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
