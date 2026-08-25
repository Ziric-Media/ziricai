#!/usr/bin/env node
/**
 * Verify Central Motors website listing parser against cached HTML fixtures.
 *
 * Usage:
 *   node scripts/verify-central-motors-import.js
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
    parseListingHtml,
    toUpsertVehicle,
    parseSitemapListingUrls,
    extractWordPressPostId,
    extractGalleryImageUrls,
    parseTitleFields,
    extractServiceHistory,
    extractWarranty,
    CENTRAL_MOTORS_RTB_COMPANY_ID,
    CENTRAL_MOTORS_SOURCE,
} from "../services/inventory/adapters/centralMotorsRtbAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "test", "fixtures", "central-motors");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function loadFixture(name) {
    return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

function testSitemapParsing() {
    const xml = loadFixture("listings-sitemap-snippet.xml");
    const urls = parseSitemapListingUrls(xml);
    assert(urls.length === 2, `Expected 2 listing URLs, got ${urls.length}`);
    assert(urls[0].includes("/listings/2018-toyota-auris"), "First sitemap URL mismatch");
    assert(!urls.some((u) => u.endsWith("/listings/")), "Should exclude listings index URL");
    console.log("✓ sitemap URL parsing");
}

function testHondaAmaze() {
    const html = loadFixture("honda-amaze.html");
    const parsed = parseListingHtml(html, "https://centralmotorsrtb.co.za/listings/2024-honda-amaze-1-2-comfort-auto/");
    const vehicle = toUpsertVehicle(parsed, CENTRAL_MOTORS_RTB_COMPANY_ID, "2026-08-25T12:00:00.000Z");

    assert(parsed.postId === "23386", `Expected postId 23386, got ${parsed.postId}`);
    assert(parsed.year === 2024 && parsed.make === "Honda" && parsed.model === "Amaze", "Title fields mismatch");
    assert(parsed.price === 219950, `Expected price 219950, got ${parsed.price}`);
    assert(parsed.mileage === 40205, `Expected mileage 40205, got ${parsed.mileage}`);
    assert(parsed.transmission === "Automatic", "Transmission mismatch");
    assert(parsed.bodyType === "SEDAN", "Body type mismatch");
    assert(parsed.exteriorColour === "White", "Exterior colour mismatch");
    assert(parsed.images.length >= 8, `Expected >=8 images, got ${parsed.images.length}`);
    assert(parsed.images.every((u) => u.includes("/wp-content/uploads/")), "Images should be WP upload URLs");
    assert(!parsed.images.some((u) => /-\d+x\d+\./.test(u)), "Images should be normalized to full size");
    assert(extractServiceHistory(parsed.description) === "FullByFranchise", "Service history mismatch");
    assert(extractWarranty(parsed.description), "Warranty should be extracted");

    assert(vehicle.vehicleId === "veh-wp-23386", "vehicleId format mismatch");
    assert(vehicle.stockNumber === "CM-WP-23386", "stockNumber format mismatch");
    assert(vehicle.availability === "available", "availability should be available");
    assert(vehicle.metadata.source === CENTRAL_MOTORS_SOURCE, "metadata.source mismatch");
    assert(vehicle.metadata.externalId === "23386", "metadata.externalId mismatch");
    assert(vehicle.metadata.bodyType === "SEDAN", "metadata.bodyType mismatch");
    assert(vehicle.metadata.sourceUrl.includes("honda-amaze"), "metadata.sourceUrl mismatch");

    console.log("✓ Honda Amaze listing parse");
}

function testHyundaiAtos() {
    const html = loadFixture("hyundai-atos.html");
    const parsed = parseListingHtml(html, "https://centralmotorsrtb.co.za/listings/2005-hyundai-atos-prime-1-1-gls/");
    const vehicle = toUpsertVehicle(parsed, CENTRAL_MOTORS_RTB_COMPANY_ID);

    assert(parsed.postId === "23343", `Expected postId 23343, got ${parsed.postId}`);
    assert(parsed.make === "Hyundai" && parsed.model === "Atos", "Hyundai Atos title parse failed");
    assert(parsed.price === 59950, `Expected price 59950, got ${parsed.price}`);
    assert(parsed.warranty === "No active warranty", "Atos warranty text should be captured");
    assert(parsed.missingFields.includes("interiorColour"), "Atos should be missing interior colour on page");
    assert(vehicle.vehicleId === "veh-wp-23343", "vehicleId mismatch for Atos");
    assert(extractGalleryImageUrls(html).length >= 5, "Atos should have gallery images");

    console.log("✓ Hyundai Atos listing parse");
}

function testFordRanger() {
    const html = loadFixture("ford-ranger.html");
    const parsed = parseListingHtml(
        html,
        "https://centralmotorsrtb.co.za/listings/2023-ford-ranger-2-0-sit-double-cab-xl-4x4-auto/"
    );
    const vehicle = toUpsertVehicle(parsed, CENTRAL_MOTORS_RTB_COMPANY_ID);

    assert(parsed.postId === "21977", `Expected postId 21977, got ${parsed.postId}`);
    assert(parsed.make === "Ford" && parsed.model === "Ranger", "Ford Ranger title parse failed");
    assert(parsed.driveType, "Drive type should be present");
    assert(vehicle.stockNumber === "CM-WP-21977", "Ford Ranger stock number mismatch");
    assert(parsed.images.length >= 4, "Ford Ranger should have multiple images");

    console.log("✓ Ford Ranger listing parse");
}

function testTitleParser() {
    const vw = parseTitleFields("2024 Volkswagen Polo Vivo Hatch 1.6 Comfortline Auto");
    assert(vw.make === "Volkswagen" && vw.model === "Polo", "Volkswagen multi-word make failed");

    const bmw = parseTitleFields("2019 BMW X5 xDrive30d M Sport");
    assert(bmw.make === "BMW" && bmw.model === "X5", "BMW title parse failed");

    console.log("✓ title field parser");
}

function testPostIdExtraction() {
    const html = `<body class="postid-99999"><input name="vehicle_id" type="hidden" value="99999" /></body>`;
    assert(extractWordPressPostId(html) === "99999", "Post ID extraction failed");
    console.log("✓ WordPress post ID extraction");
}

async function main() {
    console.log("\nCentral Motors import parser verification\n");
    testSitemapParsing();
    testPostIdExtraction();
    testTitleParser();
    testHondaAmaze();
    testHyundaiAtos();
    testFordRanger();
    console.log("\nAll Central Motors parser checks passed.\n");
}

main().catch((err) => {
    console.error("\n✗", err.message || err);
    process.exit(1);
});
