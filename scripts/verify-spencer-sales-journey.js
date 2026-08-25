#!/usr/bin/env node
/**
 * Regression: Spencer sales journey — name vs occupation, income vs purchase budget,
 * body type changes, any-price clearing, inventory search, name recall.
 *
 * Usage:
 *   node scripts/verify-spencer-sales-journey.js
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
    const { _resetMemoryInventoryForTests, seedVehicles, searchInventory } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const {
        parseExplicitCustomerName,
        parseOccupation,
        persistExplicitCustomerName,
        getCustomer,
        getCustomerDisplayName,
    } = await import("../services/customerService.js");
    const { buildWhatsAppSystemPrompt } = await import("../services/ai-core/whatsappConversationPrompt.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        extractSalesSignals,
        persistSalesContext,
        mergeSalesContext,
        formatSalesContextForPrompt,
        getActivePurchaseBudgetFilter,
    } = await import("../services/conversation/salesContext.js");
    const { extractMemoryFacts } = await import("../services/intelligence/conversationIntelligence.js");
    const { getRecommendedVehicles } = await import("../services/conversation/recommendedVehicles.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-spencer-sales-co";
    const COMPANY_NAME = "Central Motors";
    const PHONE = "27810000777";
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
            vehicleId: "veh-sed-001",
            stockNumber: "CM-SED-001",
            make: "Toyota",
            model: "Corolla 1.8 XS CVT",
            year: 2021,
            price: 289900,
            mileage: 42000,
            availability: "available",
            title: "2021 Toyota Corolla 1.8 XS CVT",
            metadata: { bodyType: "SEDAN", seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-suv-001",
            stockNumber: "CM-SUV-001",
            make: "Toyota",
            model: "Fortuner 2.4 GD-6",
            year: 2020,
            price: 399900,
            mileage: 68000,
            availability: "available",
            title: "2020 Toyota Fortuner 2.4 GD-6",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
        {
            vehicleId: "veh-suv-002",
            stockNumber: "CM-SUV-002",
            make: "Ford",
            model: "Everest 2.0 Bi-Turbo XLT",
            year: 2021,
            price: 449900,
            mileage: 55000,
            availability: "available",
            title: "2021 Ford Everest 2.0 Bi-Turbo XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
        {
            vehicleId: "veh-suv-bmw",
            stockNumber: "CM-SUV-BMW",
            make: "BMW",
            model: "X5 xDrive30d M Sport",
            year: 2022,
            price: 899900,
            mileage: 38000,
            availability: "available",
            title: "2022 BMW X5 xDrive30d M Sport",
            metadata: { bodyType: "SUV", seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-bak-001",
            stockNumber: "CM-BAK-001",
            make: "Toyota",
            model: "Hilux 2.4 GD-6 Double Cab SRX",
            year: 2020,
            price: 425000,
            mileage: 72000,
            availability: "available",
            title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
            metadata: { bodyType: "DOUBLE CAB", seatingCapacity: 5 },
        },
    ]);

    let salesContext = {};

    /* 1. Name vs occupation */
    const intro = "I'm Spencer and I'm a civil servant";
    assert(parseExplicitCustomerName(intro) === "Spencer", `name should be Spencer, got ${parseExplicitCustomerName(intro)}`);
    assert(parseOccupation(intro) === "Civil Servant", `occupation civil servant, got ${parseOccupation(intro)}`);
    assert(parseExplicitCustomerName("I'm a civil servant") === null, "occupation-only intro must not become name");
    await persistExplicitCustomerName(PHONE, "Spencer", { companyId: COMPANY_ID, companyName: COMPANY_NAME });
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: intro,
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.occupation === "Civil Servant", `occupation persisted, got ${salesContext.occupation}`);
    let customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", `displayName Spencer, got ${customer?.displayName}`);
    console.log("✓ 1. Spencer name vs civil servant occupation");

    /* 2. R20k income — no auto-confirmed purchase budget */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I earn R20,000 per month",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.income === 20000, `income 20000, got ${salesContext.income}`);
    assert(salesContext.confirmedPurchaseBudget == null, "income must not set confirmed purchase budget");
    assert(salesContext.purchaseBudget == null, "income must not set purchaseBudget");

    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I can afford around R4,500 to R5,000 per month",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(
        salesContext.targetMonthlyPaymentDisplay?.includes("/pm") || salesContext.targetMonthlyPayment != null,
        "monthly payment target captured separately"
    );
    assert(salesContext.confirmedPurchaseBudget == null, "monthly payment must not auto-confirm purchase budget");
    assert(getActivePurchaseBudgetFilter(salesContext).maxPrice == null, "no maxPrice filter from income alone");
    console.log("✓ 2. R20k income + monthly payment — no auto purchase budget");

    /* 3. Sedan preference */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "I'm looking for a sedan",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.vehiclePreferences?.includes("sedan"), "sedan preference captured");
    const sedanSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "sedan", limit: 5 });
    assert(sedanSearch.ok && sedanSearch.count >= 1, "sedan search returns results");
    assert(sedanSearch.vehicles.some((v) => v.stockNumber === "CM-SED-001"), "Corolla sedan found");
    console.log("✓ 3. Sedan preference search");

    /* 4. Budget then any price clears maxPrice */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "My budget is R350,000",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.confirmedPurchaseBudget === 350000, "confirmed purchase budget set");
    assert(getActivePurchaseBudgetFilter(salesContext).maxPrice === 350000, "maxPrice active");

    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "Actually any price is fine — what's in stock?",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.budgetOpen === true, "budgetOpen after any price");
    assert(getActivePurchaseBudgetFilter(salesContext).open === true, "filter open");
    const openSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "what do you have", limit: 10 });
    assert(openSearch.ok && openSearch.count >= 1, "any-price search still returns inventory (sedan filter may limit count)");
    console.log("✓ 4. Any price clears maxPrice — broad search works");

    /* 5. Show me SUVs — body type filter + real inventory */
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "Show me SUVs",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.bodyType === "SUV", `active bodyType SUV, got ${salesContext.bodyType}`);
    const suvSearch = await runTool("searchInventory", { ...ctx, salesContext }, { query: "SUV", limit: 10 });
    assert(suvSearch.ok && suvSearch.count >= 1, "SUV search returns results");
    assert(
        suvSearch.vehicles.every((v) => /suv|fortuner|everest|x5|bmw/i.test(v.title + v.model)),
        "SUV results only"
    );
    assert(!suvSearch.vehicles.some((v) => v.stockNumber === "CM-SED-001"), "sedan excluded from SUV search");
    console.log("✓ 5. Show me SUVs updates bodyType and finds inventory");

    /* 6. Budget query with maxPrice filter does not zero results */
    const budgetHits = await searchInventory(COMPANY_ID, "budget", { maxPrice: 400000, limit: 10 });
    assert(budgetHits.length >= 1, "budget query with maxPrice filter returns results");
    assert(budgetHits.every((v) => v.price == null || v.price <= 400000), "maxPrice respected");
    console.log("✓ 6. Budget query term does not zero filtered results");

    /* 7. Low mileage ranks ascending */
    const lowMileageHits = await searchInventory(COMPANY_ID, "low mileage", { limit: 5 });
    assert(lowMileageHits.length >= 1, "low mileage search returns results");
    const mileages = lowMileageHits.map((v) => v.mileage).filter((m) => m != null);
    assert(mileages.length >= 1, "mileage data present");
    for (let i = 1; i < mileages.length; i++) {
        assert(mileages[i] >= mileages[i - 1], "results sorted by mileage ascending");
    }
    console.log("✓ 7. Low mileage ranks by mileage ascending");

    /* 8. Recommendation persistence on first search */
    resetMemoryTenantStore();
    _resetMemoryCustomersForTests();
    await persistExplicitCustomerName(PHONE, "Spencer", { companyId: COMPANY_ID, companyName: COMPANY_NAME });
    const firstSearch = await runTool("searchInventory", ctx, { query: "Toyota", limit: 3 });
    assert(firstSearch.ok && firstSearch.count >= 1, "first search ok");
    const stored = await getRecommendedVehicles(COMPANY_ID, PHONE, "whatsapp");
    assert(stored.length >= 1, "recommended vehicles stored on first search without prior conversation");
    console.log("✓ 8. Recommendation persistence on first search");

    /* 9. Name recall — Spencer not A Civil Servant */
    customer = await getCustomer(PHONE, { companyId: COMPANY_ID });
    assert(customer.displayName === "Spencer", "Spencer persisted");
    assert(
        getCustomerDisplayName(customer, { contactName: "A Civil Servant", companyName: COMPANY_NAME }) === "Spencer",
        "Spencer beats occupation-like contact name"
    );
    const memoryFacts = extractMemoryFacts(intro);
    assert(memoryFacts.some((f) => f.includes("Spencer")), "memory facts include Spencer");
    assert(memoryFacts.some((f) => /civil servant/i.test(f)), "memory facts include occupation");
    assert(!memoryFacts.some((f) => /Customer name: A Civil Servant/i.test(f)), "must not store occupation as name");

    const prompt = buildWhatsAppSystemPrompt({
        companyId: COMPANY_ID,
        companyName: COMPANY_NAME,
        customer: { ...customer, salesContext },
        agent: { name: "Sarah", systemPrompt: "You are Sarah at Central Motors." },
    });
    assert(prompt.includes("Customer name: Spencer"), "prompt uses Spencer");
    assert(!prompt.includes("Customer name: A Civil Servant"), "prompt must not use occupation as name");
    assert(formatSalesContextForPrompt({ salesContext }).includes("Occupation: Civil Servant"), "occupation in sales context");
    console.log("✓ 9. Name recall: Spencer not A Civil Servant");

    /* 10. Forget my budget — hard clear + open filter */
    salesContext = mergeSalesContext({}, { confirmedPurchaseBudget: 350000, confirmedPurchaseBudgetDisplay: "R350000" });
    salesContext = await simulateTurn({
        companyId: COMPANY_ID,
        phone: PHONE,
        text: "Forget my budget",
        salesContext,
        persistSalesContext,
        extractSalesSignals,
        mergeSalesContext,
    });
    assert(salesContext.confirmedPurchaseBudget == null, "forget budget clears confirmedPurchaseBudget");
    assert(salesContext.budgetOpen === true, "forget budget sets budgetOpen");
    assert(getActivePurchaseBudgetFilter(salesContext).open === true, "forget budget returns open filter");
    assert(salesContext.leadStage !== "BUDGET_ESTABLISHED", "forget budget must not advance to BUDGET_ESTABLISHED");
    console.log("✓ 10. Forget my budget clears budget and opens filter");

    /* 11. Forget budget + search — stale LLM maxPrice ignored, BMW SUV not capped at 350k */
    salesContext = mergeSalesContext(
        { bodyType: "SUV", budgetOpen: true, confirmedPurchaseBudget: null },
        {}
    );
    const forgetSearch = await runTool(
        "searchInventory",
        { ...ctx, salesContext },
        { query: "SUV", maxPrice: 350000, limit: 10 }
    );
    assert(forgetSearch.ok && forgetSearch.count >= 1, "forget-budget search returns SUVs");
    assert(
        forgetSearch.vehicles.some((v) => v.stockNumber === "CM-SUV-BMW"),
        "BMW SUV over 350k included when budget open despite stale LLM maxPrice"
    );
    console.log("✓ 11. budgetOpen strips stale LLM maxPrice — BMW SUV not filtered at 350k");

    /* 12. Most expensive SUV returns highest-priced SUV */
    const expensiveSuv = await searchInventory(COMPANY_ID, "most expensive SUV", { bodyType: "SUV", limit: 1 });
    assert(expensiveSuv.length === 1, "most expensive SUV returns one result");
    assert(expensiveSuv[0].stockNumber === "CM-SUV-BMW", `highest SUV is BMW X5, got ${expensiveSuv[0].stockNumber}`);
    assert(expensiveSuv[0].price === 899900, `highest SUV price 899900, got ${expensiveSuv[0].price}`);

    const cheapestSuv = await searchInventory(COMPANY_ID, "cheapest SUV", { bodyType: "SUV", limit: 1 });
    assert(cheapestSuv.length === 1, "cheapest SUV returns one result");
    assert(cheapestSuv[0].stockNumber === "CM-SUV-001", `cheapest SUV is Fortuner, got ${cheapestSuv[0].stockNumber}`);
    console.log("✓ 12. Price-extreme sorting — most/cheapest expensive SUV");

    console.log("\nAll Spencer sales journey verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
