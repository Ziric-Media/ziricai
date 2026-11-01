#!/usr/bin/env node
/**
 * G2 — Read-only Phone Number ID reconciliation report (no mutations).
 *
 * Usage:
 *   node scripts/reconcile-whatsapp-phone-assignments-readonly.mjs
 *   node scripts/reconcile-whatsapp-phone-assignments-readonly.mjs --suffix=3699
 *   npx @railway/cli run node scripts/reconcile-whatsapp-phone-assignments-readonly.mjs --suffix=3699
 */
import { buildWhatsAppReconciliationReport } from "../services/platform/reconcileWhatsAppPhoneAssignments.js";

function parseArgs(argv) {
    const out = { phoneSuffix: null, phoneNumberId: null };
    for (const arg of argv) {
        if (arg.startsWith("--suffix=")) out.phoneSuffix = arg.slice("--suffix=".length);
        if (arg.startsWith("--phoneNumberId=")) out.phoneNumberId = arg.slice("--phoneNumberId=".length);
    }
    return out;
}

const filters = parseArgs(process.argv.slice(2));
const report = await buildWhatsAppReconciliationReport(filters);
console.log(JSON.stringify(report, null, 2));
