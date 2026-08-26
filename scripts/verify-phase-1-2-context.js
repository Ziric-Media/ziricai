#!/usr/bin/env node
/**
 * Phase 1.2 UAT regression — budget wording, SUV filter, family/comparison prompts, gallery images.
 *
 * Usage:
 *   node scripts/verify-phase-1-2-context.js
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
        formatSalesContextForPrompt,
        getBudgetState,
        BUDGET_STATES,
        buildInventoryRecommendationReason,
        formatVehicleComparison,
        extractSalesSignals,
        mergeSalesContext,
    } = await import("../services/conversation/salesContext.js");
    const {
        isGalleryImageIntent,
        resolveGalleryVehicleTargets,
    } = await import("../services/conversation/vehicleReference.js");
    const {
        buildGalleryOutboundPlan,
        formatGalleryDeliveryReply,
    } = await import("../services/conversation/vehicleOutboundPlan.js");
    const {
        buildWhatsAppSystemPrompt,
        WHATSAPP_SALES_TRUTH_RULES,
        WHATSAPP_MEDIA_RULES,
    } = await import("../services/ai-core/whatsappConversationPrompt.js");

    resetMemoryTenantStore();
    _resetMemoryInventoryForTests();
    _resetMemoryCustomersForTests();
    initAiTools();

    const COMPANY_ID = "verify-phase-1-2-co";
    const PHONE = "27810000999";
    const ctx = {
        companyId: COMPANY_ID,
        customerId: PHONE,
        customerPhone: PHONE,
        customerName: "Test User",
        agentId: "agent-sales",
        channel: "whatsapp",
    };

    await seedVehicles(COMPANY_ID, [
        {
            vehicleId: "veh-amaze",
            stockNumber: "CM-AMAZE",
            make: "Honda",
            model: "Amaze",
            year: 2024,
            price: 219900,
            mileage: 12000,
            availability: "available",
            title: "2024 Honda Amaze 1.2 Comfort Auto",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
            images: ["https://example.com/amaze.jpg"],
        },
        {
            vehicleId: "veh-quest",
            stockNumber: "CM-QUEST",
            make: "Toyota",
            model: "Corolla Quest",
            year: 2020,
            price: 249900,
            mileage: 45000,
            availability: "available",
            title: "2020 Toyota Corolla Quest 1.8 Plus",
            metadata: { bodyType: "sedan", seatingCapacity: 5 },
            images: ["https://example.com/quest.jpg"],
        },
        {
            vehicleId: "veh-everest-a",
            stockNumber: "CM-EV-A",
            make: "Ford",
            model: "Everest",
            year: 2019,
            price: 399900,
            mileage: 95000,
            availability: "available",
            title: "2019 Ford Everest 2.0 TDCi XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
            images: ["https://example.com/everest-a.jpg"],
        },
        {
            vehicleId: "veh-everest-b",
            stockNumber: "CM-EV-B",
            make: "Ford",
            model: "Everest",
            year: 2021,
            price: 449900,
            mileage: 55000,
            availability: "available",
            title: "2021 Ford Everest 2.0 Bi-Turbo XLT",
            metadata: { bodyType: "SUV", seatingCapacity: 7 },
            images: ["https://example.com/everest-b.jpg"],
        },
    ]);

    /* 1. Budget unspecified wording — income-only must not say "no limit" */
    const incomeCtx = mergeSalesContext({}, extractSalesSignals("I earn R25,000 per month"));
    assert(getBudgetState(incomeCtx) === BUDGET_STATES.INCOME_ONLY, "income-only budget state");
    assert(incomeCtx.budgetOpen !== true, "income must not set budgetOpen");

    const incomePrompt = formatSalesContextForPrompt({ salesContext: incomeCtx });
    assert(
        incomePrompt.includes("Budget not specified yet"),
        "income-only must say budget not specified"
    );
    assert(
        !incomePrompt.toLowerCase().includes("no limit"),
        "income-only must not say no limit"
    );
    assert(
        !incomePrompt.includes("Confirmed purchase budget"),
        "income-only must not show confirmed purchase budget"
    );

    const openCtx = mergeSalesContext(incomeCtx, extractSalesSignals("Forget my budget"));
    assert(getBudgetState(openCtx) === BUDGET_STATES.BUDGET_OPEN, "budget-open after forget");
    const openPrompt = formatSalesContextForPrompt({ salesContext: openCtx });
    assert(openPrompt.includes("open (customer explicitly cleared"), "budget-open wording");
    console.log("✓ 1. Budget unspecified wording — no 'no limit' without budgetOpen");

    /* 2. SUV recommendation + search uses bodyType SUV filter */
    const suvCtx = mergeSalesContext({}, { bodyType: "SUV", vehiclePreferences: ["SUV"] });
    const suvSearch = await runTool("searchInventory", { ...ctx, salesContext: suvCtx }, { query: "family", limit: 10 });
    assert(suvSearch.ok, "SUV search ok");
    assert(suvSearch.bodyTypeFilter === "SUV", `bodyTypeFilter SUV, got ${suvSearch.bodyTypeFilter}`);
    assert(suvSearch.count >= 1, "SUV search returns results");
    assert(
        !suvSearch.vehicles.some((v) => v.stockNumber === "CM-AMAZE" || v.stockNumber === "CM-QUEST"),
        "sedans must not appear in SUV-filtered search"
    );
    assert(
        suvSearch.vehicles.some((v) => v.stockNumber === "CM-EV-A" || v.stockNumber === "CM-EV-B"),
        "SUV search must include Everest inventory"
    );
    console.log("✓ 2. SUV preference applies bodyType SUV filter in searchInventory");

    /* 3. Family reasoning prompt rules present */
    const familyReason = buildInventoryRecommendationReason(
        {
            year: 2020,
            title: "2020 Toyota Corolla Quest",
            seatingCapacity: 5,
            bodyType: "sedan",
            price: 249900,
            mileage: 45000,
        },
        { familySize: 5 }
    );
    assert(familyReason.includes("5-seat"), `family seating in reason: ${familyReason}`);
    assert(familyReason.includes("family of 5"), `family context in reason: ${familyReason}`);

    const familySalesCtx = mergeSalesContext({}, { familySize: 5 });
    const familyPrompt = formatSalesContextForPrompt({ salesContext: familySalesCtx });
    assert(familyPrompt.includes("seatingCapacity"), "family prompt mentions seatingCapacity");

    const systemPrompt = buildWhatsAppSystemPrompt({ companyName: "Central Motors" });
    assert(
        WHATSAPP_SALES_TRUTH_RULES.includes("FAMILY RECOMMENDATIONS"),
        "sales truth rules include family recommendations"
    );
    assert(systemPrompt.includes("FAMILY RECOMMENDATIONS"), "system prompt includes family rules");
    console.log("✓ 3. Family reasoning prompt rules and recommendation reasons present");

    /* 4. Comparison prompt rules present */
    const comparison = formatVehicleComparison([
        {
            vehicleId: "veh-everest-a",
            title: "2019 Ford Everest",
            price: 399900,
            mileage: 95000,
            seatingCapacity: 7,
            fuel: "Diesel",
            transmission: "Automatic",
        },
        {
            vehicleId: "veh-everest-b",
            title: "2021 Ford Everest",
            price: 449900,
            mileage: 55000,
            seatingCapacity: 7,
            fuel: "Diesel",
            transmission: "Automatic",
        },
    ]);
    assert(comparison.includes("VEHICLE COMPARISON"), "comparison block header");
    assert(comparison.includes("Price trade-off"), "price trade-off line");
    assert(comparison.includes("Mileage trade-off"), "mileage trade-off line");
    assert(
        WHATSAPP_SALES_TRUTH_RULES.includes("VEHICLE COMPARISONS"),
        "sales truth rules include vehicle comparisons"
    );
    console.log("✓ 4. Comparison prompt rules and formatVehicleComparison present");

    /* 5. Image intent detection + buildGalleryOutboundPlan for lastRecommendedVehicles */
    assert(isGalleryImageIntent("show me the pictures for both cars"), "gallery intent: both cars");
    assert(isGalleryImageIntent("Can I see photos please"), "gallery intent: see photos");
    assert(!isGalleryImageIntent("book a test drive"), "not gallery: booking");

    const lastRecommended = [
        {
            vehicleId: "veh-amaze",
            title: "2024 Honda Amaze",
            primaryImageUrl: "https://example.com/amaze.jpg",
            position: 1,
        },
        {
            vehicleId: "veh-quest",
            title: "2020 Toyota Corolla Quest",
            primaryImageUrl: "https://example.com/quest.jpg",
            position: 2,
        },
    ];
    const salesContext = { lastRecommendedVehicles: lastRecommended };
    const targets = resolveGalleryVehicleTargets(
        "show me the pictures for both cars",
        salesContext,
        []
    );
    assert(targets.length === 2, `both cars resolves 2 vehicles, got ${targets.length}`);
    assert(targets[0].vehicleId === "veh-amaze", "first vehicle Amaze");
    assert(targets[1].vehicleId === "veh-quest", "second vehicle Quest");

    const galleryPlan = buildGalleryOutboundPlan({
        vehicles: [
            { vehicleId: "veh-amaze", title: "Honda Amaze", images: ["https://example.com/amaze.jpg"] },
            { vehicleId: "veh-quest", title: "Corolla Quest", images: ["https://example.com/quest.jpg"] },
        ],
        llmReply: "Here are the photos you asked for!",
        channel: "whatsapp",
    });
    assert(galleryPlan != null, "gallery plan expected");
    assert(galleryPlan.planType === "gallery", "plan type gallery");
    assert(galleryPlan.imageCount === 2, `2 images, got ${galleryPlan.imageCount}`);
    assert(
        galleryPlan.messages.filter((m) => m.type === "image").length === 2,
        "2 image messages in plan"
    );
    assert(
        WHATSAPP_MEDIA_RULES.includes("GALLERY REQUESTS"),
        "media rules include gallery requests"
    );
    console.log("✓ 5. Gallery intent + buildGalleryOutboundPlan for lastRecommendedVehicles");

    /* 6. Image send failure path — don't claim success without send */
    const successReply = formatGalleryDeliveryReply("Here are your photos.", {
        expectedImages: 2,
        sentImages: 2,
    });
    assert(
        !successReply.includes("wasn't able to deliver"),
        "success path must not include failure note"
    );

    const failReply = formatGalleryDeliveryReply("You'll see them shortly.", {
        expectedImages: 2,
        sentImages: 0,
    });
    assert(
        failReply.includes("wasn't able to deliver"),
        "failure path must report delivery failure"
    );
    assert(
        !failReply.toLowerCase().includes("you'll see them shortly"),
        "failure path replaces optimistic promise"
    );

    const partialReply = formatGalleryDeliveryReply("", { expectedImages: 2, sentImages: 1 });
    assert(partialReply.includes("only able to send some"), "partial failure message");
    console.log("✓ 6. Image send failure path — honest delivery reporting");

    console.log("\nAll Phase 1.2 context verification checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
