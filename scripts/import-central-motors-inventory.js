#!/usr/bin/env node
/**
 * Import Central Motors Rustenburg website inventory into ZiricAI inventoryService.
 *
 * Usage:
 *   node scripts/import-central-motors-inventory.js
 *   node scripts/import-central-motors-inventory.js --dry-run --limit=5
 *   node scripts/import-central-motors-inventory.js --company-id=central-motors-rtb --delay=1500
 */
import dotenv from "dotenv";
import {
    CENTRAL_MOTORS_RTB_COMPANY_ID,
    CENTRAL_MOTORS_SOURCE,
    fetchAllListings,
    buildImportReport,
    tallyImportStats,
} from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import {
    upsertVehicle,
    listVehiclesByCompany,
} from "../services/inventory/inventoryService.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../services/storage/seedDemoTenants.js";

dotenv.config();

function parseArgs(argv) {
    const args = {
        companyId: CENTRAL_MOTORS_RTB_COMPANY_ID,
        dryRun: false,
        limit: null,
        delay: 1200,
        overwriteDemo: false,
    };

    for (const arg of argv) {
        if (arg === "--dry-run") args.dryRun = true;
        else if (arg === "--overwrite-demo=true") args.overwriteDemo = true;
        else if (arg === "--overwrite-demo=false") args.overwriteDemo = false;
        else if (arg.startsWith("--company-id=")) args.companyId = arg.split("=")[1];
        else if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]);
        else if (arg.startsWith("--delay=")) args.delay = Number(arg.split("=")[1]);
    }

    return args;
}

function guardCompanyTarget(companyId, overwriteDemo) {
    if (companyId === CENTRAL_MOTORS_COMPANY_ID && !overwriteDemo) {
        throw new Error(
            `Refusing to import into demo tenant "${CENTRAL_MOTORS_COMPANY_ID}". ` +
                `Pass --company-id=${CENTRAL_MOTORS_RTB_COMPANY_ID} (default) or explicitly ` +
                `--company-id=${CENTRAL_MOTORS_COMPANY_ID} --overwrite-demo=true`
        );
    }
}

async function markMissingFromSitemap(companyId, activeVehicleIds, dryRun) {
    const existing = await listVehiclesByCompany(companyId);
    const stale = existing.filter(
        (v) =>
            v.metadata?.source === CENTRAL_MOTORS_SOURCE &&
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
    guardCompanyTarget(args.companyId, args.overwriteDemo);

    console.log(`Importing Central Motors inventory → ${args.companyId}`);
    console.log(`dryRun=${args.dryRun} limit=${args.limit ?? "all"} delay=${args.delay}ms\n`);

    const { urls, results, failures } = await fetchAllListings({
        companyId: args.companyId,
        delayMs: args.delay,
        limit: args.limit,
        onProgress: ({ index, total, url, ok, error }) => {
            const status = ok ? "ok" : `FAIL (${error})`;
            console.log(`[${index}/${total}] ${status} ${url}`);
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
        console.log(`Marked unavailable (missing from sitemap): ${markedUnavailable}`);
    }

    if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
    console.error("[import-central-motors-inventory] Failed:", err.message || err);
    process.exit(1);
});
