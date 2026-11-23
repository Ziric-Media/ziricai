#!/usr/bin/env node
/**
 * BCS-03 — Import Babes Car Sales website inventory (verified sitemap sync).
 *
 *   node scripts/import-babes-car-sales-inventory.mjs
 *   node scripts/import-babes-car-sales-inventory.mjs --dry-run --limit=5
 *   railway run node scripts/import-babes-car-sales-inventory.mjs
 */
import dotenv from "dotenv";
import {
    BABES_CAR_SALES_COMPANY_ID,
    BABES_CAR_SALES_SOURCE,
    fetchBabesWebsiteListings,
    buildImportReport,
    tallyImportStats,
} from "../services/inventory/adapters/babesCarSalesAdapter.js";
import { upsertVehicle, listVehiclesByCompany } from "../services/inventory/inventoryService.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { getCompany } from "../services/tenants/companyService.js";

dotenv.config();

function parseArgs(argv) {
    const args = {
        companyId: BABES_CAR_SALES_COMPANY_ID,
        dryRun: false,
        limit: null,
        delay: 1200,
    };
    for (const arg of argv) {
        if (arg === "--dry-run") args.dryRun = true;
        else if (arg.startsWith("--company-id=")) args.companyId = arg.split("=")[1];
        else if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]);
        else if (arg.startsWith("--delay=")) args.delay = Number(arg.split("=")[1]);
    }
    return args;
}

function guardTarget(companyId) {
    if (companyId === CENTRAL_MOTORS_RTB_COMPANY_ID || companyId === "demo-central-motors") {
        throw new Error(`Refusing to import Babes website stock into "${companyId}"`);
    }
    if (companyId !== BABES_CAR_SALES_COMPANY_ID) {
        throw new Error(`Babes import only supports company-id=${BABES_CAR_SALES_COMPANY_ID}`);
    }
}

async function markMissingFromSitemap(companyId, activeVehicleIds, dryRun) {
    const existing = await listVehiclesByCompany(companyId);
    const stale = existing.filter(
        (v) =>
            v.metadata?.source === BABES_CAR_SALES_SOURCE &&
            v.availability === "available" &&
            !activeVehicleIds.has(v.vehicleId)
    );
    if (!stale.length) return 0;
    if (dryRun) return stale.length;
    const syncedAt = new Date().toISOString();
    for (const vehicle of stale) {
        await upsertVehicle({
            ...vehicle,
            availability: "unavailable",
            metadata: {
                ...vehicle.metadata,
                lastSyncedAt: syncedAt,
                removedFromSitemapAt: syncedAt,
            },
        });
    }
    return stale.length;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    guardTarget(args.companyId);

    const company = await getCompany(args.companyId);
    if (!company) {
        throw new Error(`Company ${args.companyId} not found — run BCS-02 provision first`);
    }

    console.log(`BCS-03: Babes inventory import → ${args.companyId}`);
    console.log(`dryRun=${args.dryRun} limit=${args.limit ?? "all"} delay=${args.delay}ms\n`);

    const { urls, results, failures } = await fetchBabesWebsiteListings({
        companyId: args.companyId,
        delayMs: args.delay,
        limit: args.limit,
        onProgress: ({ index, total, url, ok, error }) => {
            console.log(`[${index}/${total}] ${ok ? "ok" : `FAIL (${error})`} ${url}`);
        },
    });

    let upsertCount = 0;
    const activeVehicleIds = new Set();

    if (!args.dryRun) {
        for (const { vehicle } of results) {
            await upsertVehicle(vehicle);
            activeVehicleIds.add(vehicle.vehicleId);
            upsertCount += 1;
        }
    } else {
        for (const { vehicle } of results) {
            activeVehicleIds.add(vehicle.vehicleId);
        }
        upsertCount = results.length;
    }

    const markedUnavailable = await markMissingFromSitemap(args.companyId, activeVehicleIds, args.dryRun);
    const stats = tallyImportStats(results, failures, urls.length);
    stats.upsertCount = upsertCount;

    console.log("\n" + buildImportReport(stats));
    if (markedUnavailable > 0) {
        console.log(`Marked unavailable (removed from sitemap): ${markedUnavailable}`);
    }

    if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
    console.error("[import-babes-car-sales-inventory]", err.message || err);
    process.exit(1);
});