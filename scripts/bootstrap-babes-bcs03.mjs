#!/usr/bin/env node
/**
 * BCS-03 — Babes inventory sync + Discover directory + inventory knowledge note.
 * Requires: tenant from BCS-02, Postgres for inventory when DATABASE_URL set.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { hasAdminCredentials } from "../services/storage/storageAdapter.js";
import {
    BABES_CAR_SALES_COMPANY_ID,
    BABES_DISPLAY_NAME,
    BABES_BUSINESS,
    bootstrapBabesCarSalesProfile,
} from "../services/automotive/babesCarSalesBootstrap.js";
import { saveBusinessDirectoryEntry } from "../services/users/businessDirectoryService.js";
import { ensureOrgEntitySafe } from "../services/network/networkIdentityService.js";
import { saveKnowledgeDocument, listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";
import { listAiEmployees } from "../services/tenants/aiEmployeeService.js";
import { listVehiclesByCompany } from "../services/inventory/inventoryService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function upsertInventoryKnowledge(companyId) {
    const agents = await listAiEmployees(companyId);
    const agent = agents.find((a) => a.isDefault) || agents[0];
    if (!agent) return 0;
    const kbId = agent.knowledgeBaseId || `kb-${companyId}`;
    let count = null;
    try {
        count = (await listVehiclesByCompany(companyId)).filter((v) => v.availability === "available").length;
    } catch (err) {
        console.warn("[babes-bcs03] inventory count skipped:", err?.message || err);
    }
    await saveKnowledgeDocument({
        companyId,
        knowledgeBaseId: kbId,
        agentId: agent.id,
        id: "babes-kn-inventory",
        title: "Live vehicle inventory",
        type: "inventory",
        source: "babes-bootstrap",
        content: `Babes Car Sales vehicle stock in Sarah is synced from ${BABES_BUSINESS.website} listings (sitemap). Only vehicles marked available in the inventory service should be offered — if searchInventory returns no match, do not invent stock.${
            count != null ? ` Current available units (system): approximately ${count}.` : ""
        } Sold or removed website listings are marked unavailable automatically on sync.`,
    });
    return 1;
}

async function main() {
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS");
        process.exit(2);
    }

    const dryRun = process.argv.includes("--skip-import");
    if (!dryRun) {
        execSync("node scripts/import-babes-car-sales-inventory.mjs", {
            cwd: ROOT,
            stdio: "inherit",
            env: process.env,
        });
    }

    await bootstrapBabesCarSalesProfile(BABES_CAR_SALES_COMPANY_ID);
    await upsertInventoryKnowledge(BABES_CAR_SALES_COMPANY_ID);

    const directory = await saveBusinessDirectoryEntry(BABES_CAR_SALES_COMPANY_ID, {
        discoverability: "public",
        displayName: BABES_DISPLAY_NAME,
        industry: "Automotive — used & new vehicles",
        location: "Rustenburg, North West",
        shortDescription:
            "Used and new vehicles, finance assistance, trade-ins, sourcing and nationwide delivery — Rustenburg.",
        tags: ["cars", "used cars", "finance", "trade-in", "rustenburg", "dealership"],
        address: BABES_BUSINESS.address,
        contact: {
            phone: BABES_BUSINESS.phone,
            email: BABES_BUSINESS.email,
            website: BABES_BUSINESS.website,
        },
        hours: [
            { label: "Mon–Fri", value: "08:00–17:00" },
            { label: "Sat", value: "08:00–13:00" },
        ],
        verified: false,
    });
    await ensureOrgEntitySafe(BABES_CAR_SALES_COMPANY_ID);

    let available = [];
    try {
        available = (await listVehiclesByCompany(BABES_CAR_SALES_COMPANY_ID)).filter(
            (v) => v.availability === "available"
        );
    } catch {
        available = [];
    }

    console.log(
        JSON.stringify(
            {
                gate: "BCS-03",
                companyId: BABES_CAR_SALES_COMPANY_ID,
                availableVehicles: available.length,
                discover: { snId: directory.snId, discoverability: directory.discoverability },
                sarahDiscover: `https://sarah.ziricai.com/#discover/${BABES_CAR_SALES_COMPANY_ID}`,
            },
            null,
            2
        )
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});