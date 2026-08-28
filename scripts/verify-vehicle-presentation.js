#!/usr/bin/env node
/**
 * Phase 1.2 — customer vehicle presentation format verification.
 *
 * Usage:
 *   node scripts/verify-vehicle-presentation.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        formatVehicleCustomerCard,
        formatPriceLine,
        formatSeatingLine,
        assertCustomerCardHasNoInternalIds,
        stripInternalVehicleIdentifiersFromText,
    } = await import("../services/conversation/vehiclePresentation.js");
    const {
        buildVehicleOutboundPlan,
        buildGalleryOutboundPlan,
        dedupeRecommendedVehicles,
        pickHeroImageUrl,
        pickAdditionalGalleryImageUrls,
        stripWhatsAppImageUrlsFromText,
        stripVehicleListingProseFromText,
        MAX_VEHICLE_IMAGES_PER_TURN,
        MAX_GALLERY_IMAGES_PER_VEHICLE,
    } = await import("../services/conversation/vehicleOutboundPlan.js");
    const { storeRecommendedVehicles } = await import("../services/conversation/recommendedVehicles.js");
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");
    const { buildWhatsAppSystemPrompt, WHATSAPP_MEDIA_RULES } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );

    console.log("\nPhase 1.2 — vehicle presentation verification\n");

    const sampleVehicle = {
        vehicleId: "veh-wp-fortuner",
        stockNumber: "CM-WP-001",
        year: 2020,
        make: "Toyota",
        model: "Fortuner",
        trim: "2.4 GD-6",
        title: "2020 Toyota Fortuner 2.4 GD-6",
        price: 399900,
        mileage: 71000,
        transmission: "Automatic",
        fuel: "Diesel",
        seatingCapacity: 7,
        location: "Central Motors Sandton, 42 Main Road",
        financeEstimate: "From R10,100/month (72 months, 10% deposit, subject to approval)",
        images: [
            "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.webp",
            "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner-hero.jpg",
            "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner-2.jpg",
            "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner-3.jpg",
            "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner-4.jpg",
        ],
    };

    /* 1. Customer presentation format */
    const card = formatVehicleCustomerCard(sampleVehicle, 0);
    assert(card.startsWith("1. 🚙 *2020 Toyota Fortuner 2.4 GD-6*"), "numbered bold title with vehicle emoji");
    assert(card.includes("💰 Price: R399,900"), "price line");
    assert(card.includes("📏 Mileage: 71,000 km"), "mileage line");
    assert(card.includes("⚙️ Transmission: Automatic"), "transmission line");
    assert(card.includes("⛽ Fuel Type: Diesel"), "fuel line");
    assert(card.includes("👨‍👩‍👧‍👦 Seating Capacity: 7"), "seating line");
    assert(card.includes("📍 Location: Central Motors Sandton"), "location line");
    assert(card.includes("💳 Finance Estimate: From R10,100/month"), "finance line");
    assert(!card.includes("http"), "no raw URLs in card");
    assert(!card.includes("!["), "no markdown images in card");
    console.log("✓ 1. Customer presentation format");

    /* 2. Internal stock number retained in state */
    resetMemoryTenantStore();
    const COMPANY_ID = "verify-vehicle-pres-co";
    const PHONE = "27810000888";
    const stored = await storeRecommendedVehicles(COMPANY_ID, PHONE, "whatsapp", [sampleVehicle]);
    assert(stored[0].stockNumber === "CM-WP-001", "stockNumber retained in conversation state");
    assert(stored[0].vehicleId === "veh-wp-fortuner", "vehicleId retained in conversation state");
    console.log("✓ 2. Internal stock number and vehicleId retained in state");

    /* 3. No stock number in customer output */
    assert(assertCustomerCardHasNoInternalIds(card), "card has no internal IDs");
    assert(!card.includes("CM-WP"), "no stock number in card");
    assert(!card.includes("veh-wp"), "no vehicleId in card");
    console.log("✓ 3. No stock number or vehicleId in customer output");

    /* 4. No raw image URLs in text */
    const llmWithUrls =
        "Here are options!\n\n" +
        "![Fortuner](https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.jpg)\n" +
        "Stock CM-WP-001 veh-wp-fortuner https://centralmotorsrtb.co.za/img/x.png";
    const stripped = stripVehicleListingProseFromText(llmWithUrls, [sampleVehicle]);
    assert(!stripped.includes("http"), "URLs stripped from LLM reply");
    assert(!stripped.includes("CM-WP"), "stock stripped from LLM reply");
    assert(!stripped.includes("veh-wp"), "vehicleId stripped from LLM reply");
    console.log("✓ 4. No raw image URLs or internal IDs in customer text");

    /* 5. No markdown images */
    const mdOnly = stripWhatsAppImageUrlsFromText("See ![car](https://x.com/a.jpg) here");
    assert(!mdOnly.includes("!["), "markdown images removed");
    console.log("✓ 5. No markdown images in customer text");

    /* 6. Vehicle deduplication */
    const duped = dedupeRecommendedVehicles([
        { vehicleId: "v1", stockNumber: "A" },
        { vehicleId: "v1", stockNumber: "A" },
        { vehicleId: "v2", stockNumber: "B" },
    ]);
    assert(duped.length === 2, "dedupe by vehicleId");
    console.log("✓ 6. Vehicle deduplication");

    /* 7. Missing-field handling */
    const sparse = {
        vehicleId: "v-sparse",
        stockNumber: "CM-SPARSE",
        year: 2018,
        make: "Toyota",
        model: "Corolla",
        price: 199900,
    };
    const sparseCard = formatVehicleCustomerCard(sparse, 1);
    assert(sparseCard.startsWith("2. 🚙 *"), "second card numbered correctly");
    assert(sparseCard.includes("💰 Price: R199,900"), "price shown when present");
    assert(!sparseCard.includes("📏 Mileage"), "mileage omitted when missing");
    assert(!sparseCard.includes("⚙️ Transmission"), "transmission omitted when missing");
    assert(!sparseCard.includes("⛽ Fuel"), "fuel omitted when missing");
    assert(sparseCard.includes("Not specified in listing"), "seating fallback when missing");
    assert(!sparseCard.includes("💳 Finance"), "finance omitted when missing");
    assert(formatPriceLine(null) === null, "formatPriceLine null-safe");
    console.log("✓ 7. Missing-field handling (omit or seating fallback)");

    /* 8. Hero image delivery */
    const hero = pickHeroImageUrl(sampleVehicle);
    assert(hero.endsWith("fortuner-hero.jpg"), "hero skips webp, picks first jpg/png");
    const plan = buildVehicleOutboundPlan({
        toolResults: [{ tool: "searchInventory", ok: true, vehicles: [sampleVehicle] }],
        llmReply: "Great family SUVs for you!",
        channel: "whatsapp",
    });
    assert(plan != null, "outbound plan built");
    const imageParts = plan.messages.filter((m) => m.type === "image");
    const cardParts = plan.messages.filter((m) => m.type === "text" && m.text.includes("💰"));
    assert(imageParts.length === 1, "one hero image per vehicle");
    assert(imageParts[0].link === hero, "hero image in outbound plan");
    assert(cardParts.length === 1, "one formatted card in plan");
    assert(cardParts[0].text.includes("*2020 Toyota Fortuner"), "card in outbound plan");
    console.log("✓ 8. Hero image delivery via native WhatsApp image part");

    /* 9. Gallery request — up to 3 native images per vehicle (includes hero) */
    const galleryPlan = buildGalleryOutboundPlan({
        vehicles: [sampleVehicle],
        llmReply: "Here are more photos!",
        channel: "whatsapp",
    });
    assert(galleryPlan.planType === "gallery", "gallery plan type");
    assert(galleryPlan.imageCount === 3, `gallery sends 3 images, got ${galleryPlan.imageCount}`);
    const galleryImages = galleryPlan.messages.filter((m) => m.type === "image");
    assert(galleryImages.length === 3, "3 native image messages");
    assert(galleryImages.every((m) => !m.caption), "gallery images omit duplicate title captions");
    assert(galleryImages[0].link.endsWith("fortuner-hero.jpg"), "gallery includes hero image first");
    console.log("✓ 9. Gallery request (up to 3 native images, no duplicate titles)");

    /* 10. Maximum 3 vehicles */
    const manyVehicles = Array.from({ length: 5 }, (_, i) => ({
        vehicleId: `v${i}`,
        stockNumber: `CM-${i}`,
        year: 2020,
        make: "Toyota",
        model: `Model${i}`,
        price: 300000 + i * 10000,
        images: [`https://example.com/${i}.jpg`],
    }));
    const cappedPlan = buildVehicleOutboundPlan({
        toolResults: [{ tool: "searchInventory", ok: true, vehicles: manyVehicles }],
        llmReply: "Options for you",
        channel: "whatsapp",
    });
    assert(cappedPlan.vehicleCount === MAX_VEHICLE_IMAGES_PER_TURN, `capped at ${MAX_VEHICLE_IMAGES_PER_TURN}`);
    assert(cappedPlan.messages.filter((m) => m.type === "image").length === MAX_VEHICLE_IMAGES_PER_TURN, "max hero images");
    console.log("✓ 10. Maximum 3 vehicles per inventory response");

    /* Prompt includes 3-layer structure */
    const prompt = buildWhatsAppSystemPrompt({ companyName: "Central Motors" });
    assert(prompt.includes("THREE-LAYER INVENTORY RESPONSE"), "prompt has 3-layer rules");
    assert(WHATSAPP_MEDIA_RULES.includes("do NOT duplicate"), "media rules forbid duplicating cards");
    assert(prompt.includes("NEVER paste vehicle photo URLs"), "prompt forbids URLs in text");
    console.log("✓ Prompt instructs Sarah on 3-layer structure without card duplication");

    console.log("\nAll Phase 1.2 vehicle presentation checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
