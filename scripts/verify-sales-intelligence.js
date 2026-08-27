#!/usr/bin/env node
/**
 * Phase 2 — Sarah sales intelligence regression.
 *
 * Usage:
 *   node scripts/verify-sales-intelligence.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { _resetMemoryInventoryForTests, seedVehicles } = await import("../services/inventory/inventoryService.js");
    const { _resetMemoryCustomersForTests } = await import("../services/database/customerRepository.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        extractSalesSignals,
        mergeSalesContext,
        formatSalesContextForPrompt,
        getActivePurchaseBudgetFilter,
        getBudgetState,
        BUDGET_STATES,
        buildAlternativeSearchStrategy,
        buildInventoryRecommendationReason,
        detectComparisonIntent,
        detectNeedsVsRequest,
        formatClosingSuggestion,
        getSalesProgressionStage,
        getEthicalUpsellPriceBand,
    } = await import("../services/conversation/salesContext.js");
    const {
        buildWhatsAppSystemPrompt,
        WHATSAPP_SALES_INTELLIGENCE_RULES,
    } = await import("../services/ai-core/whatsappConversationPrompt.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-sales-intel-co";
    const PHONE = "27810000666";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Test Buyer",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-sed-1",
            stockNumber: "CM-SED-1",
            make: "Toyota",
            model: "Corolla Quest",
            year: 2020,
            price: 219900,
            mileage: 48000,
            availability: "available",
            title: "2020 Toyota Corolla Quest 1.8",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-sed-2",
            stockNumber: "CM-SED-2",
            make: "Honda",
            model: "Amaze",
            year: 2021,
            price: 239900,
            mileage: 35000,
            availability: "available",
            title: "2021 Honda Amaze 1.2",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-suv-1",
            stockNumber: "CM-SUV-1",
            make: "Ford",
            model: "Everest",
            year: 2019,
            price: 389900,
            mileage: 92000,
            availability: "available",
            title: "2019 Ford Everest 2.0 TDCi",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
        {
            vehicleId: "veh-upsell",
            stockNumber: "CM-UPS",
            make: "Toyota",
            model: "Fortuner",
            year: 2020,
            price: 279900,
            mileage: 65000,
            availability: "available",
            title: "2020 Toyota Fortuner 2.4",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
        },
    ]);

    /* 1. Never dead-end: SUV search with no SUVs in stock → fallback alternatives */
    const NO_SUV_CO = "verify-sales-intel-no-suv";
    await seedVehicles(NO_SUV_CO, [
        {
            vehicleId: "veh-only-sed-a",
            stockNumber: "CM-NO-SUV-A",
            make: "VW",
            model: "Polo",
            year: 2019,
            price: 199900,
            mileage: 55000,
            availability: "available",
            title: "2019 VW Polo 1.0 TSI",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
        },
        {
            vehicleId: "veh-only-sed-b",
            stockNumber: "CM-NO-SUV-B",
            make: "Toyota",
            model: "Corolla",
            year: 2018,
            price: 189900,
            mileage: 72000,
            availability: "available",
            title: "2018 Toyota Corolla 1.6",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
        },
    ]);

    const emptySuvSearch = await runTool(
        "searchInventory",
        { ...ctx, companyId: NO_SUV_CO, salesContext: { bodyType: "SUV" } },
        { query: "SUV family car", bodyType: "SUV", limit: 5 }
    );
    assert(emptySuvSearch.ok, "SUV fallback search ok");
    assert(emptySuvSearch.count >= 1, "fallback must return in-stock alternatives, not empty");
    assert(emptySuvSearch.fallbackSearch != null, "fallbackSearch metadata expected");
    assert(
        !emptySuvSearch.message.toLowerCase().includes("we don't have"),
        "tool message must not dead-end"
    );
    assert(
        emptySuvSearch.message.includes("FALLBACK SEARCH APPLIED") ||
            emptySuvSearch.fallbackSearch?.reason,
        "fallback guidance for Sarah"
    );
    console.log("✓ 1. Never dead-end — empty SUV search returns fallback alternatives");

    /* 2. Brand not in stock → fallback with alternatives */
    const mercedesSearch = await runTool(
        "searchInventory",
        ctx,
        { query: "Mercedes-Benz C-Class", make: "Mercedes-Benz", limit: 5 }
    );
    assert(mercedesSearch.ok, "Mercedes search ok");
    assert(mercedesSearch.count >= 1, "Mercedes not in stock must still return alternatives");
    assert(mercedesSearch.fallbackSearch != null, "brand fallback applied");
    assert(
        mercedesSearch.vehicles.every((v) => v.vehicleId && v.stockNumber),
        "alternatives must be real inventory records"
    );
    console.log("✓ 2. Brand not in stock — general knowledge path + in-stock alternatives");

    /* 3. Budget R200k — shows closest options, not rejection */
    const budgetCtx = mergeSalesContext({}, extractSalesSignals("My budget is R200,000"));
    assert(budgetCtx.confirmedPurchaseBudget === 200000, "R200k purchase budget");
    const budgetSearch = await runTool("searchInventory", { ...ctx, salesContext: budgetCtx }, { query: "car", limit: 5 });
    assert(budgetSearch.ok, "budget search ok");
    assert(budgetSearch.count >= 1, "R200k budget must show closest in-stock options");
    assert(
        budgetSearch.fallbackSearch != null ||
            budgetSearch.vehicles.some((v) => v.price == null || v.price <= 200000),
        "R200k shows in-budget or fallback closest options — never rejects customer"
    );
    assert(
        !budgetSearch.message.toLowerCase().includes("increase your budget"),
        "must not tell customer to increase budget"
    );
    console.log("✓ 3. Budget R200k — closest options shown, not rejected");

    /* 4. Income R25k — advisory not hard filter (regression) */
    const incomeCtx = mergeSalesContext({}, extractSalesSignals("I earn R25,000 per month"));
    assert(getBudgetState(incomeCtx) === BUDGET_STATES.INCOME_ONLY, "income-only state");
    assert(getActivePurchaseBudgetFilter(incomeCtx).maxPrice == null, "income must not set maxPrice filter");
    const incomeSearch = await runTool("searchInventory", { ...ctx, salesContext: incomeCtx }, { query: "SUV", limit: 5 });
    assert(incomeSearch.ok && incomeSearch.count >= 1, "income-only must not zero inventory");
    assert(
        incomeSearch.vehicles.some((v) => v.price != null && v.price > 250000),
        "income-only must not hard-filter high-value stock"
    );
    console.log("✓ 4. Income R25k — advisory only, not hard filter");

    /* 5. Comparison intent → recommendation guidance in prompt */
    const compareSignals = extractSalesSignals("Which is better — Fortuner or Everest for a family?");
    assert(compareSignals.comparisonIntent?.detected === true, "comparison intent detected");
    const compareCtx = mergeSalesContext({ leadStage: "OPTIONS_PRESENTED" }, compareSignals);
    const comparePrompt = formatSalesContextForPrompt({ salesContext: compareCtx });
    assert(comparePrompt.includes("Comparison intent detected"), "comparison in sales context");
    assert(comparePrompt.includes("recommend one with evidence"), "comparison recommendation rule");
    assert(detectComparisonIntent("Compare the Hilux vs Ranger").detected, "compare vs pattern");
    console.log("✓ 5. Comparison intent — recommendation with reasoning guidance");

    /* 6. Closing — meaningful next step, not 'anything else' */
    const closingDiscovery = formatClosingSuggestion({ leadStage: "NEW_LEAD" });
    assert(closingDiscovery.includes("SALES CLOSING GUIDANCE"), "closing block present");
    assert(!closingDiscovery.toLowerCase().includes("anything else"), "no anything else close");
    assert(closingDiscovery.includes("qualifying question") || closingDiscovery.includes("Soft close"), "discovery close");

    const closingBooked = formatClosingSuggestion({ leadStage: "TEST_DRIVE_BOOKED" });
    assert(closingBooked.includes("After you"), "post-test-drive follow-up close");

    const promptWithClose = formatSalesContextForPrompt({
        salesContext: { leadStage: "VEHICLE_SEARCH", familySize: 4 },
    });
    assert(promptWithClose.includes("SALES CLOSING GUIDANCE"), "closing injected into prompt context");
    assert(
        WHATSAPP_SALES_INTELLIGENCE_RULES.includes("NEVER end with \"anything else?\""),
        "prompt forbids anything else close"
    );
    console.log("✓ 6. Closing — meaningful next-step guidance in context and prompt");

    /* 7. No fabricated inventory — vehicleIds from DB only */
    const allSearches = [emptySuvSearch, mercedesSearch, budgetSearch, incomeSearch];
    for (const result of allSearches) {
        for (const v of result.vehicles || []) {
            assert(v.vehicleId, "vehicleId required");
            assert(v.stockNumber?.startsWith("CM-"), `real stock number: ${v.stockNumber}`);
        }
    }
    console.log("✓ 7. No fabricated inventory — all results have verified vehicleIds/stock");

    /* 8. Specs→benefit language in recommendations */
    const benefitReason = buildInventoryRecommendationReason(
        {
            year: 2019,
            title: "2019 Ford Everest",
            seatingCapacity: 7,
            bodyType: "SUV",
            mileage: 92000,
            price: 389900,
            fuel: "Diesel",
        },
        { familySize: 5 }
    );
    assert(benefitReason.includes("fits your family"), "seating benefit");
    assert(
        benefitReason.includes("—") && (benefitReason.includes("school runs") || benefitReason.includes("diesel")),
        `specs→benefit language: ${benefitReason}`
    );
    console.log("✓ 8. Specs→benefit language in recommendation reasons");

    /* 9. Ethical upsell — slightly above budget in upsellOptions */
    const upsellCtx = mergeSalesContext({}, extractSalesSignals("My budget is R250,000"));
    const upsellSearch = await runTool("searchInventory", { ...ctx, salesContext: upsellCtx }, { query: "SUV", limit: 3 });
    assert(upsellSearch.ok, "upsell search ok");
    const band = getEthicalUpsellPriceBand(250000);
    assert(band.minPrice === 250000, "upsell band min");
    assert(band.maxPrice > 250000, "upsell band above budget");
    if (upsellSearch.upsellOptions?.length) {
        assert(
            upsellSearch.upsellOptions[0].price > 250000,
            "upsell option above stated budget"
        );
        assert(
            upsellSearch.message.includes("ETHICAL UPSELL") || upsellSearch.upsellOptions.length >= 1,
            "upsell guidance present"
        );
    }
    console.log("✓ 9. Ethical upsell — option slightly above budget when applicable");

    /* 10. Needs vs request + sales progression in system prompt */
    const needs = detectNeedsVsRequest("I want a BMW for status and comfort");
    assert(needs.request, "brand request captured");
    assert(needs.needs.some((n) => n.includes("luxury") || n.includes("status")), "underlying need captured");

    const systemPrompt = buildWhatsAppSystemPrompt({ companyName: "Central Motors" });
    assert(systemPrompt.includes("SARAH SALES INTELLIGENCE"), "sales intelligence in system prompt");
    assert(systemPrompt.includes("NEVER DEAD-END"), "never dead-end rules in prompt");
    assert(systemPrompt.includes("SALES PROGRESSION"), "progression stages in prompt");
    assert(getSalesProgressionStage("OPTIONS_PRESENTED") === "RECOMMENDATION", "progression mapping");
    console.log("✓ 10. Needs-based selling + sales progression encoded in prompt");

    /* 11. buildAlternativeSearchStrategy produces ordered relaxations */
    const strategies = buildAlternativeSearchStrategy({
        query: "BMW X5",
        filters: { make: "BMW", bodyType: "SUV", maxPrice: 300000, limit: 5 },
        salesContext: { familySize: 5 },
    });
    assert(strategies.length >= 2, "multiple fallback strategies");
    assert(
        strategies.some((s) => s.reason.includes("brand") || s.reason.includes("body type")),
        "strategies relax brand/body filters"
    );
    console.log("✓ 11. buildAlternativeSearchStrategy — ordered fallback relaxations");

    console.log("\nAll Phase 2 sales intelligence verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
