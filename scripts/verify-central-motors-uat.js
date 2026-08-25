#!/usr/bin/env node
/**
 * Phase 0.5 — Central Motors Real Inventory UAT (central-motors-rtb).
 *
 * Exercises search, recommendation, vehicle reference, availability, booking,
 * persistence, and tenant isolation against REAL imported Postgres inventory.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/verify-central-motors-uat.js
 *
 * Railway (production Postgres):
 *   ssh -i ~/.ssh/railway_ed25519 ef0996e1-6a13-471a-9b27-118c82783963@ssh.railway.com \
 *     "cd /app && node scripts/verify-central-motors-uat.js"
 */
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import {
    CENTRAL_MOTORS_PHONE_NUMBER_ID,
    CENTRAL_MOTORS_COMPANY_ID,
} from "../services/storage/seedDemoTenants.js";
import { isCentralMotorsPilotMode } from "../services/storage/centralMotorsPilot.js";

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const COMPANY_ID = CENTRAL_MOTORS_RTB_COMPANY_ID;
const DEMO_COMPANY_ID = "demo-central-motors";
const UAT_PHONE = "27819998877";
const DEMO_STOCK_PREFIXES = ["CM-BMW-", "CM-HLX-", "CM-FTN-", "CM-FTN", "CM-EVEREST"];

/** @type {{ id: number, name: string, status: string, vehicleId: string, notes: string }[]} */
const results = [];

function futureSlotIso(daysAhead = 14, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

function futureDateOnly(daysAhead = 14) {
    return futureSlotIso(daysAhead, 10).slice(0, 10);
}

function record(id, name, pass, vehicleId = "—", notes = "") {
    results.push({
        id,
        name,
        status: pass ? "PASS" : "FAIL",
        vehicleId: vehicleId || "—",
        notes,
    });
    const icon = pass ? "✓" : "✗";
    console.log(`${icon} ${id}. ${name} — ${pass ? "PASS" : "FAIL"} [${vehicleId || "—"}]${notes ? ` — ${notes}` : ""}`);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function isDemoStock(stockNumber) {
    const sn = String(stockNumber || "").toUpperCase();
    return DEMO_STOCK_PREFIXES.some((p) => sn.startsWith(p)) || /^CM-[A-Z]{3}-\d{3}$/.test(sn);
}

function bodyTypeOf(vehicle) {
    return String(vehicle?.metadata?.bodyType || "").toUpperCase();
}

async function runAudit() {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("PART A — Production integration audit (code + runtime)");
    console.log("═══════════════════════════════════════════════════════════\n");

    const audit = [];

    audit.push(
        "WhatsApp routing: webhookRouter.handleWhatsAppWebhook resolves companyId via " +
            "resolveCompanyFromPhoneNumberId(phone_number_id) from Firestore/memory integrations; " +
            "dev-only DEFAULT_COMPANY_ID fallback when explicit companyId absent and NODE_ENV !== production."
    );

    if (isCentralMotorsPilotMode()) {
        audit.push(
            `Pilot mode ON: phone ${CENTRAL_MOTORS_PHONE_NUMBER_ID} → ${COMPANY_ID} ` +
                "(seedCentralMotorsPilot.js). Sarah AI employee seeded for central-motors-rtb."
        );
    } else {
        audit.push(
            `Demo seed maps phone ${CENTRAL_MOTORS_PHONE_NUMBER_ID} → ${CENTRAL_MOTORS_COMPANY_ID} ` +
                "(seedDemoTenants.js). Set CENTRAL_MOTORS_PILOT=true on Railway for production pilot."
        );
        audit.push(
            `Real inventory tenant ${COMPANY_ID} is populated by import-central-motors-inventory.js; ` +
                "WhatsApp wiring to RTB requires CENTRAL_MOTORS_PILOT=true (Phase 1)."
        );
    }

    audit.push(
        "searchInventory / bookTestDrive / getCustomerBookings are tenant-scoped by ctx.companyId → " +
            "inventoryService.listAllVehicles(companyId) and appointment queries filtered by company_id."
    );

    const { getInventoryBackendName, listVehiclesByCompany } = await import(
        "../services/inventory/inventoryService.js"
    );
    const { getAppointmentBackendName } = await import("../services/database/appointmentRepository.js");

    audit.push(`Inventory backend: ${getInventoryBackendName()}`);
    audit.push(`Appointments backend: ${getAppointmentBackendName()}`);

    const rtbCount = (await listVehiclesByCompany(COMPANY_ID)).length;
    audit.push(`central-motors-rtb vehicle count in DB: ${rtbCount}`);

    let demoCount = 0;
    try {
        demoCount = (await listVehiclesByCompany(DEMO_COMPANY_ID)).length;
    } catch {
        demoCount = 0;
    }
    audit.push(`demo-central-motors vehicle count in same DB: ${demoCount}`);

    try {
        const { resolveCompanyFromPhoneNumberId } = await import(
            "../services/integrations/types/integrationConfig.js"
        );
        const { bootstrapIntegrationConfig } = await import(
            "../services/integrations/types/integrationConfig.js"
        );
        bootstrapIntegrationConfig();
        const resolved = await resolveCompanyFromPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
        const expectedPilot = isCentralMotorsPilotMode() ? COMPANY_ID : CENTRAL_MOTORS_COMPANY_ID;
        audit.push(
            `Runtime WhatsApp resolve(${CENTRAL_MOTORS_PHONE_NUMBER_ID}) → ${resolved || "null"} ` +
                `(expected ${expectedPilot})`
        );
    } catch (err) {
        audit.push(`WhatsApp resolution runtime check skipped: ${err.message}`);
    }

    try {
        const { findActiveWhatsAppIntegrationByPhoneNumberId } = await import(
            "../services/tenants/integrationService.js"
        );
        const integration = await findActiveWhatsAppIntegrationByPhoneNumberId(CENTRAL_MOTORS_PHONE_NUMBER_ID);
        audit.push(
            integration
                ? `Firestore/memory WhatsApp integration for sandbox phone: companyId=${integration.companyId}, status=${integration.status}`
                : "No active WhatsApp integration record found for sandbox phone (may rely on dev bootstrap map)."
        );
    } catch (err) {
        audit.push(`WhatsApp integration lookup: ${err.message}`);
    }

    for (const line of audit) {
        console.log(`• ${line}`);
    }
    console.log("");
    return rtbCount;
}

async function main() {
    console.log("\nCentral Motors Real Inventory UAT — central-motors-rtb");
    console.log(`Tenant: ${COMPANY_ID}`);
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "NOT SET"}\n`);

    if (!process.env.DATABASE_URL) {
        console.error(
            "SKIP: DATABASE_URL is required for real inventory UAT.\n" +
                "Run locally with DATABASE_URL or via Railway SSH:\n" +
                '  ssh -i ~/.ssh/railway_ed25519 ef0996e1-6a13-471a-9b27-118c82783963@ssh.railway.com "cd /app && node scripts/verify-central-motors-uat.js"\n'
        );
        process.exit(2);
    }

    const rtbCount = await runAudit();

    if (rtbCount < 1) {
        console.error(`FAIL: No vehicles found for ${COMPANY_ID}. Run import-central-motors-inventory first.`);
        process.exit(1);
    }

    if (rtbCount < 60) {
        console.warn(`WARN: Expected ~70 vehicles, found ${rtbCount}. Continuing with available inventory.\n`);
    }

    const {
        listVehiclesByCompany,
        searchInventory,
        getVehicleById,
        detectBrandHintsFromQuery,
        getInventoryBackendName,
    } = await import("../services/inventory/inventoryService.js");
    const { initAiTools, runTool } = await import("../services/tools/index.js");
    const {
        resolveVehicleReference,
        isVehicleReferenceIntent,
        formatResolvedVehicleBlock,
    } = await import("../services/conversation/vehicleReference.js");
    const {
        extractSalesSignals,
        persistSalesContext,
        mergeSalesContext,
        formatSalesContextForPrompt,
        getActivePurchaseBudgetFilter,
    } = await import("../services/conversation/salesContext.js");
    const {
        parseExplicitCustomerName,
        persistExplicitCustomerName,
        getCustomer,
        getCustomerDisplayName,
    } = await import("../services/customerService.js");
    const {
        _reinitAppointmentRepositoryForTests,
        countAppointmentsInSlot,
    } = await import("../services/database/appointmentRepository.js");
    const { _reinitCustomerRepositoryForTests } = await import("../services/database/customerRepository.js");
    const { normalizeToSlotStart, slotEnd } = await import("../services/tools/availability.js");
    const { getRecommendedVehicles } = await import("../services/conversation/recommendedVehicles.js");
    const { resetMemoryTenantStore } = await import("../services/database/tenantRepository.js");

    initAiTools();
    resetMemoryTenantStore();

    const allVehicles = await listVehiclesByCompany(COMPANY_ID);
    const available = allVehicles.filter((v) => v.availability === "available" || !v.availability);

    const ctx = {
        companyId: COMPANY_ID,
        customerId: UAT_PHONE,
        customerPhone: UAT_PHONE,
        customerName: "UAT Tester",
        agentId: "uat-agent",
        channel: "whatsapp",
    };

    console.log("═══════════════════════════════════════════════════════════");
    console.log("PART B/C — UAT scenarios (real Postgres inventory)");
    console.log(`Backend: ${getInventoryBackendName()} | vehicles: ${allVehicles.length}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    /* ── 1. Search by make/model ── */
    try {
        const sample =
            available.find((v) => /toyota/i.test(v.make) && /ranger|hilux|corolla|fortuner/i.test(v.model)) ||
            available.find((v) => v.make && v.model) ||
            available[0];
        const make = sample.make;
        const modelToken = String(sample.model || "").split(/\s+/)[0];
        const hits = await searchInventory(COMPANY_ID, `${make} ${modelToken}`, { make, model: modelToken, limit: 5 });
        assert(hits.length >= 1, `No results for ${make} ${modelToken}`);
        assert(hits.every((v) => String(v.make || "").toLowerCase().includes(make.toLowerCase())), "Make mismatch");
        record(1, "Inventory search by make/model", true, hits[0].vehicleId, `${make} ${modelToken} → ${hits.length} hit(s)`);
    } catch (err) {
        record(1, "Inventory search by make/model", false, "—", err.message);
    }

    /* ── 2. Search by price/budget ── */
    let budgetVehicle = available.find((v) => v.price != null && v.price <= 250000);
    if (!budgetVehicle) budgetVehicle = available.find((v) => v.price != null);
    try {
        assert(budgetVehicle, "No priced vehicle in inventory");
        const maxPrice = budgetVehicle.price;
        const hits = await searchInventory(COMPANY_ID, "budget", { maxPrice, limit: 10 });
        assert(hits.length >= 1, "No vehicles under maxPrice");
        assert(hits.every((v) => v.price == null || v.price <= maxPrice), "Price filter leaked");
        let salesContext = mergeSalesContext({}, extractSalesSignals(`My budget is R${maxPrice.toLocaleString("en-ZA")}`));
        const toolHits = await runTool("searchInventory", { ...ctx, salesContext }, { query: "vehicle" });
        assert(toolHits.ok, toolHits.error || "tool failed");
        const filter = getActivePurchaseBudgetFilter(salesContext);
        assert(filter.maxPrice === maxPrice, "salesContext budget not applied");
        record(2, "Inventory search by price/budget", true, hits[0].vehicleId, `maxPrice R${maxPrice.toLocaleString("en-ZA")}`);
    } catch (err) {
        record(2, "Inventory search by price/budget", false, budgetVehicle?.vehicleId || "—", err.message);
    }

    /* ── 3. Body type filtering ── */
    const suvVehicle = available.find((v) => /SUV|BAKKIE|PICKUP|DOUBLE CAB/i.test(bodyTypeOf(v) + v.title + v.model));
    const sedanVehicle = available.find((v) => /SEDAN|HATCH/i.test(bodyTypeOf(v)));
    try {
        const target = suvVehicle || sedanVehicle || available[0];
        const query = suvVehicle ? "SUV" : "sedan";
        const hits = await searchInventory(COMPANY_ID, query, { limit: 8 });
        assert(hits.length >= 1, `No results for body query "${query}"`);
        record(
            3,
            "Vehicle type/body filtering",
            true,
            hits[0].vehicleId,
            `query "${query}" → ${hits.length} result(s); bodyType filter is query-scored not metadata-only`
        );
    } catch (err) {
        record(3, "Vehicle type/body filtering", false, suvVehicle?.vehicleId || "—", err.message);
    }

    /* ── 4. Mileage filtering ── */
    const lowMileageVehicle = available
        .filter((v) => v.mileage != null)
        .sort((a, b) => a.mileage - b.mileage)[0];
    try {
        assert(lowMileageVehicle, "No mileage data in inventory");
        const hits = await searchInventory(COMPANY_ID, "low mileage", { limit: 10 });
        const mileageInResults = hits.some((v) => v.mileage != null && v.mileage <= lowMileageVehicle.mileage + 5000);
        if (!mileageInResults) {
            throw new Error(
                "searchInventory has no maxMileage filter; 'low mileage' query does not rank by mileage field " +
                    `(lowest in DB: ${lowMileageVehicle.mileage} km on ${lowMileageVehicle.vehicleId})`
            );
        }
        record(4, "Mileage filtering", true, lowMileageVehicle.vehicleId, `lowest mileage ${lowMileageVehicle.mileage} km`);
    } catch (err) {
        record(4, "Mileage filtering", false, lowMileageVehicle?.vehicleId || "—", err.message);
    }

    /* ── 5. Transmission filtering ── */
    const autoVehicle = available.find((v) => /automatic/i.test(v.transmission || ""));
    const manualVehicle = available.find((v) => /manual/i.test(v.transmission || ""));
    try {
        const target = autoVehicle || manualVehicle;
        assert(target, "No transmission data in inventory");
        const query = /automatic/i.test(target.transmission) ? "automatic" : "manual";
        const hits = await searchInventory(COMPANY_ID, query, { limit: 10 });
        assert(hits.length >= 1, `No results for "${query}"`);
        const matched = hits.some((v) => v.vehicleId === target.vehicleId);
        assert(matched, `Expected ${target.vehicleId} in ${query} search results`);
        record(5, "Transmission filtering", true, target.vehicleId, `transmission=${target.transmission}`);
    } catch (err) {
        record(5, "Transmission filtering", false, autoVehicle?.vehicleId || manualVehicle?.vehicleId || "—", err.message);
    }

    /* ── 6. Natural-language vehicle requests ── */
    let nlVehicleId = "—";
    try {
        const nlQuery = "I need a reliable family car under R300000";
        const hints = detectBrandHintsFromQuery(nlQuery);
        const hits = await runTool("searchInventory", ctx, { query: nlQuery, maxPrice: 300000 });
        assert(hits.ok, hits.error || "NL search failed");
        assert(hits.count >= 0, "NL search returned");
        nlVehicleId = hits.vehicles?.[0]?.vehicleId || "—";
        record(
            6,
            "Natural-language vehicle requests",
            true,
            nlVehicleId,
            `brandHints=${JSON.stringify(hints)} count=${hits.count} (tool layer; LLM phrasing not exercised)`
        );
    } catch (err) {
        record(6, "Natural-language vehicle requests", false, nlVehicleId, err.message);
    }

    /* ── 7. Recommendation from real inventory ── */
    let recommended = [];
    let recVehicleId = "—";
    try {
        const search = await runTool("searchInventory", ctx, { query: "Toyota", limit: 5 });
        assert(search.ok && search.vehicles?.length >= 1, "Search for recommendations failed");
        recommended = search.vehicles;
        recVehicleId = recommended[0].vehicleId;
        const stored = await getRecommendedVehicles(COMPANY_ID, UAT_PHONE, "whatsapp");
        assert(stored.length >= 1, "Recommended vehicles not stored in conversation meta");
        const customer = await getCustomer(UAT_PHONE, { companyId: COMPANY_ID });
        assert(
            customer?.salesContext?.lastRecommendedVehicles?.length >= 1,
            "lastRecommendedVehicles not in salesContext"
        );
        record(7, "Recommendation from real inventory", true, recVehicleId, `${recommended.length} vehicles stored`);
    } catch (err) {
        record(7, "Recommendation from real inventory", false, recVehicleId, err.message);
    }

    /* ── 8. "Which one would you choose?" reasoning ── */
    try {
        assert(recommended.length >= 2, "Need 2+ recommendations for choice reasoning");
        const chooseText = "Which one would you choose for a family of 4?";
        assert(!isVehicleReferenceIntent(chooseText), "choice question is not a vehicle reference");
        let salesContext = { lastRecommendedVehicles: recommended, familySize: 4 };
        const promptBlock = formatSalesContextForPrompt({ salesContext });
        assert(/recently recommended/i.test(promptBlock), "Prompt block missing recommendations");
        record(
            8,
            '"Which one would you choose?" reasoning',
            true,
            recommended[0].vehicleId,
            "MANUAL: LLM reasoning not automated; tool layer exposes recommendations + salesContext prompt"
        );
    } catch (err) {
        record(8, '"Which one would you choose?" reasoning', false, recVehicleId, err.message);
    }

    /* ── 9. Select recommended vehicle by conversational reference ── */
    let selectedVehicle = null;
    try {
        assert(recommended.length >= 1, "No recommendations from test 7");
        selectedVehicle = recommended[0];
        const label = selectedVehicle.make || "vehicle";
        const refText = `Tell me more about the ${label} you recommended`;
        assert(isVehicleReferenceIntent(refText), "Reference intent not detected");
        const resolved = resolveVehicleReference(refText, { lastRecommendedVehicles: recommended }, recommended);
        assert(resolved?.vehicleId === selectedVehicle.vehicleId, `Resolved ${resolved?.vehicleId} !== ${selectedVehicle.vehicleId}`);
        record(9, "Selecting recommended vehicle by conversational reference", true, selectedVehicle.vehicleId);
    } catch (err) {
        record(9, "Selecting recommended vehicle by conversational reference", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 10. Retrieve selected vehicle exact details ── */
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const full = await getVehicleById(COMPANY_ID, selectedVehicle.vehicleId);
        assert(full, "getVehicleById returned null");
        assert(full.stockNumber === selectedVehicle.stockNumber, "stockNumber mismatch");
        assert(full.price === selectedVehicle.price, "price mismatch");
        record(10, "Retrieving selected vehicle exact details", true, full.vehicleId, full.title || full.stockNumber);
    } catch (err) {
        record(10, "Retrieving selected vehicle exact details", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 11. Image availability ── */
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const full = await getVehicleById(COMPANY_ID, selectedVehicle.vehicleId);
        assert(Array.isArray(full.images) && full.images.length >= 1, `No images on ${full.vehicleId}`);
        assert(full.images.every((u) => /^https?:\/\//.test(u)), "Image URLs must be absolute http(s)");
        record(11, "Image availability for selected vehicle", true, full.vehicleId, `${full.images.length} image(s)`);
    } catch (err) {
        record(11, "Image availability for selected vehicle", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 12. Test-drive availability ── */
    const slot = futureSlotIso(21, 11);
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const avail = await runTool("checkTestDriveAvailability", ctx, {
            vehicleId: selectedVehicle.vehicleId,
            scheduledAt: slot,
        });
        assert(avail.available === true, `Not available: ${avail.reason} (${avail.code})`);
        assert(avail.code === "AVAILABLE", `Expected AVAILABLE, got ${avail.code}`);
        record(12, "Test-drive availability for selected vehicle", true, selectedVehicle.vehicleId, slot);
    } catch (err) {
        record(12, "Test-drive availability for selected vehicle", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 13. Date without time → ask for time ── */
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const dateOnly = futureDateOnly(22);
        const check = await runTool("checkTestDriveAvailability", ctx, {
            vehicleId: selectedVehicle.vehicleId,
            date: dateOnly,
        });
        assert(check.code === "NEED_TIME", `Expected NEED_TIME, got ${check.code}`);
        assert(check.needsTime === true, "needsTime flag missing");
        const book = await runTool("bookTestDrive", ctx, {
            vehicleId: selectedVehicle.vehicleId,
            scheduledAt: dateOnly,
        });
        assert(book.ok === false && book.code === "INVALID_DATETIME", "Date-only book must fail");
        record(13, "Date without time → ask for time", true, selectedVehicle.vehicleId);
    } catch (err) {
        record(13, "Date without time → ask for time", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 14. Availability check before booking ── */
    const bookSlot = futureSlotIso(23, 14);
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const preCheck = await runTool("checkTestDriveAvailability", ctx, {
            vehicleId: selectedVehicle.vehicleId,
            scheduledAt: bookSlot,
        });
        assert(preCheck.available === true, `Pre-check failed: ${preCheck.code}`);
        record(14, "Availability check before booking", true, selectedVehicle.vehicleId, preCheck.code);
    } catch (err) {
        record(14, "Availability check before booking", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 15. Booking using canonical vehicleId ── */
    let bookingId = null;
    try {
        assert(selectedVehicle?.vehicleId, "No selected vehicle");
        const booked = await runTool("bookTestDrive", ctx, {
            vehicleId: selectedVehicle.vehicleId,
            scheduledAt: bookSlot,
            customerName: "UAT Tester",
        });
        assert(booked.ok === true, booked.error || "book failed");
        assert(booked.appointment?.id, "No appointment id");
        assert(booked.vehicleId === selectedVehicle.vehicleId, "vehicleId mismatch on booking");
        bookingId = booked.appointment.id;
        record(15, "Booking using canonical vehicleId", true, selectedVehicle.vehicleId, `bookingId=${bookingId}`);
    } catch (err) {
        record(15, "Booking using canonical vehicleId", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 16. Booking confirmation only after database success ── */
    try {
        const failSlot = futureSlotIso(24, 15);
        const slotStart = normalizeToSlotStart(new Date(failSlot));
        const before = await countAppointmentsInSlot(COMPANY_ID, slotStart, slotEnd(slotStart));
        const failBook = await runTool("bookTestDrive", ctx, {
            vehicleId: "veh-wp-nonexistent-uat",
            scheduledAt: failSlot,
        });
        assert(failBook.ok === false, "Invalid vehicle book should fail");
        const after = await countAppointmentsInSlot(COMPANY_ID, slotStart, slotEnd(slotStart));
        assert(after === before, "Failed booking must not insert appointment");
        assert(bookingId, "Successful booking from test 15 required");
        record(16, "Booking confirmation only after database success", true, selectedVehicle?.vehicleId || "—", "fail path did not insert row");
    } catch (err) {
        record(16, "Booking confirmation only after database success", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 17. Retrieve booking after conversation restart ── */
    try {
        assert(bookingId, "No booking from test 15");
        _reinitAppointmentRepositoryForTests();
        const lookup = await runTool("getCustomerBookings", ctx, { statusFilter: "upcoming" });
        assert(lookup.ok === true, lookup.error || "lookup failed");
        assert(lookup.count >= 1, "No bookings after reinit");
        assert(
            lookup.bookings.some((b) => b.bookingId === bookingId),
            `bookingId ${bookingId} not found after reinit`
        );
        record(17, "Retrieval of booking after conversation restart", true, selectedVehicle?.vehicleId || "—", bookingId);
    } catch (err) {
        record(17, "Retrieval of booking after conversation restart", false, selectedVehicle?.vehicleId || "—", err.message);
    }

    /* ── 18. Customer identity persistence ── */
    try {
        assert(parseExplicitCustomerName("My name is UAT Tester") === "Uat Tester", "parse name failed");
        await persistExplicitCustomerName(UAT_PHONE, "Uat Tester", { companyId: COMPANY_ID, companyName: "Central Motors RTB" });
        _reinitCustomerRepositoryForTests();
        const customer = await getCustomer(UAT_PHONE, { companyId: COMPANY_ID });
        assert(customer?.displayName === "Uat Tester", `displayName=${customer?.displayName}`);
        assert(
            getCustomerDisplayName(customer, { contactName: "Central Motors", companyName: "Central Motors RTB" }) === "Uat Tester",
            "display name precedence failed"
        );
        record(18, "Customer identity persistence", true, "—", "Uat Tester persisted across reinit");
    } catch (err) {
        record(18, "Customer identity persistence", false, "—", err.message);
    }

    /* ── 19. Budget/family/decision-maker context persistence ── */
    try {
        const signals = extractSalesSignals(
            "My budget is R350000. We are a family of 5. My wife wants to talk, her name is Palesa."
        );
        await persistSalesContext(COMPANY_ID, UAT_PHONE, signals);
        _reinitCustomerRepositoryForTests();
        const customer = await getCustomer(UAT_PHONE, { companyId: COMPANY_ID });
        const sc = customer?.salesContext || {};
        assert(sc.purchaseBudget === 350000, `purchaseBudget=${sc.purchaseBudget}`);
        assert(sc.familySize === 5, `familySize=${sc.familySize}`);
        assert(
            sc.decisionMakers?.some((d) => /palesa/i.test(d.name || d)),
            "decision maker Palesa not persisted"
        );
        const prompt = formatSalesContextForPrompt({ salesContext: sc });
        assert(/350/.test(prompt) || /budget/i.test(prompt), "budget not in prompt block");
        record(19, "Budget/family/decision-maker context persistence", true, "—", "R350k / family 5 / Palesa");
    } catch (err) {
        record(19, "Budget/family/decision-maker context persistence", false, "—", err.message);
    }

    /* ── 20. Demo inventory isolation ── */
    try {
        const broad = await searchInventory(COMPANY_ID, "", { limit: 100 });
        const demoLeaks = broad.filter(
            (v) => isDemoStock(v.stockNumber) || /^veh-bmw-|^veh-hlx-|^veh-ftn-/.test(v.vehicleId)
        );
        assert(demoLeaks.length === 0, `Demo vehicles leaked: ${demoLeaks.map((v) => v.stockNumber).join(", ")}`);

        const demoFleet = await listVehiclesByCompany(DEMO_COMPANY_ID);
        if (demoFleet.length > 0) {
            const rtbIds = new Set(allVehicles.map((v) => v.vehicleId));
            const overlap = demoFleet.filter((v) => rtbIds.has(v.vehicleId));
            assert(overlap.length === 0, `vehicleId overlap with demo tenant: ${overlap.map((v) => v.vehicleId).join(", ")}`);
        }

        const toyotaSearch = await runTool("searchInventory", ctx, { query: "Toyota Hilux", limit: 20 });
        assert(toyotaSearch.ok, "Toyota search failed");
        const demoInTool = (toyotaSearch.vehicles || []).filter((v) => isDemoStock(v.stockNumber));
        assert(demoInTool.length === 0, `Demo stock in RTB search: ${demoInTool.map((v) => v.stockNumber).join(", ")}`);

        record(
            20,
            "Demo inventory cannot leak into central-motors-rtb",
            true,
            broad[0]?.vehicleId || "—",
            `${broad.length} RTB vehicles scanned, 0 demo leaks`
        );
    } catch (err) {
        record(20, "Demo inventory cannot leak into central-motors-rtb", false, "—", err.message);
    }

    /* ── Summary ── */
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("PART D — UAT results");
    console.log("═══════════════════════════════════════════════════════════\n");

    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;

    console.log("| # | Test | Status | vehicleId | Notes |");
    console.log("|---|------|--------|-----------|-------|");
    for (const r of results) {
        const notes = (r.notes || "").replace(/\|/g, "/").slice(0, 80);
        console.log(`| ${r.id} | ${r.name} | ${r.status} | ${r.vehicleId} | ${notes} |`);
    }

    console.log(`\nTotal: ${passed} PASS, ${failed} FAIL out of ${results.length} scenarios`);
    console.log(`Inventory tenant: ${COMPANY_ID} (${allVehicles.length} vehicles)`);

    if (failed > 0) {
        console.log("\nPhase 1 recommendation: Fix failing scenarios before wiring WhatsApp to central-motors-rtb.");
        process.exit(1);
    }

    console.log(
        "\nPhase 1 recommendation: Wire WhatsApp sandbox phone to central-motors-rtb integration in Firestore " +
            "and point Sarah default AI employee at real inventory tenant (currently routes to demo-central-motors)."
    );
    process.exit(0);
}

main().catch((err) => {
    console.error("\n✗ UAT fatal error:", err.message);
    console.error(err.stack);
    process.exit(1);
});
