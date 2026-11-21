#!/usr/bin/env node
/**
 * PAY-02E — repair checkout sessions stuck at pending when payment ledger is captured.
 * Default: dry-run (no writes). Use --apply to execute repairs.
 *
 *   railway run node scripts/repair-checkout-sessions-pending.mjs
 *   railway run node scripts/repair-checkout-sessions-pending.mjs --apply
 */
await import("../services/env/startupEnv.js").then((m) => m.bootstrapEnv());
await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

import { repairPendingCheckoutSessions } from "../services/revenue/consumerCheckoutPaymentService.js";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;

const report = await repairPendingCheckoutSessions({ dryRun: !apply, limit });
console.log(JSON.stringify(report, null, 2));
if (apply) {
    const repaired = report.results.filter((r) => r.action === "repaired").length;
    console.log(`repair-checkout-sessions-pending: repaired ${repaired} session(s)`);
} else {
    const would = report.results.filter((r) => r.action === "would_repair").length;
    console.log(`repair-checkout-sessions-pending: dry-run — ${would} session(s) would repair (pass --apply to write)`);
}