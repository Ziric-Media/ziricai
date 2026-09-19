#!/usr/bin/env node
/**
 * Phase 2B-1.1 — Mission Control dashboard rendering verification.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(relPath) {
    return readFileSync(join(root, relPath), "utf8");
}

async function main() {
    console.log("\nPhase 2B-1.1 Mission Control dashboard rendering verification\n");

    const dashboard = read("js/admin/modules/dashboard.js");
    const opsService = read("js/admin/services/operationsService.js");

    assert(dashboard.includes("getPlatformDashboardView"), "Dashboard must load via platform dashboard API");
    assert(dashboard.includes("state.selectedCompanyId"), "Dashboard must respect tenant scope selector");
    assert(dashboard.includes("crmLeads"), "Dashboard must render CRM lead KPIs");
    assert(!dashboard.includes("Avg Response Time"), "Dashboard must not render legacy demo KPI card");
    assert(!dashboard.includes("OpenAI Tokens Used"), "Dashboard must not render legacy demo token KPI card");
    assert(dashboard.includes("formatMetric"), "Dashboard must use availability-aware metric formatting");
    assert(dashboard.includes("return '—'") || dashboard.includes('return "—"'), "Missing metrics must render em dash");

    assert(!opsService.includes("DEMO_OPERATIONS"), "operationsService must not spread DEMO_OPERATIONS");
    assert(opsService.includes("dataSource: 'crm'"), "operationsService must expose crm dataSource on live path");
    assert(opsService.includes("buildUnavailableMetricsBundle"), "operationsService must have unavailable live shell");
    assert(opsService.includes("items: []"), "Activity feed must not fall back to demo items");

    console.log("✓ Dashboard and operationsService avoid demo KPI fallback mixing");
    console.log("\nAll Phase 2B-1.1 dashboard rendering checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
