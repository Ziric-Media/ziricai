#!/usr/bin/env node
/**
 * G2.1 — Compare direct Firestore reconciliation vs production HTTP endpoint.
 *
 * Usage:
 *   node scripts/g2-1-verify-reconciliation-parity.mjs --suffix=3699 --baseUrl=https://your-app.up.railway.app
 *
 * Env:
 *   PLATFORM_API_KEY — required for HTTP leg
 */
import { buildWhatsAppReconciliationReport } from "../services/platform/reconcileWhatsAppPhoneAssignments.js";

function parseArgs(argv) {
    const out = { phoneSuffix: null, phoneNumberId: null, baseUrl: null };
    for (const arg of argv) {
        if (arg.startsWith("--suffix=")) out.phoneSuffix = arg.slice("--suffix=".length);
        if (arg.startsWith("--phoneNumberId=")) out.phoneNumberId = arg.slice("--phoneNumberId=".length);
        if (arg.startsWith("--baseUrl=")) out.baseUrl = arg.slice("--baseUrl=".length).replace(/\/$/, "");
    }
    return out;
}

function stableReportShape(report) {
    const conflicts = (report.conflicts || []).map((c) => ({
        ...c,
        integrations: [...(c.integrations || [])].sort((a, b) =>
            String(a.companyId).localeCompare(String(b.companyId))
        ),
    }));
    return {
        summary: report.summary,
        conflicts,
        readOnly: report.readOnly,
        filters: report.filters,
    };
}

function diffSummary(a, b) {
    const issues = [];
    const keys = ["phoneIdsInReport", "duplicateActivePhoneIds", "registryMisaligned"];
    for (const k of keys) {
        if (a?.summary?.[k] !== b?.summary?.[k]) {
            issues.push(`summary.${k}: direct=${a?.summary?.[k]} http=${b?.summary?.[k]}`);
        }
    }
    const idsA = (a.conflicts?.[0]?.integrations || []).map((i) => i.companyId).sort();
    const idsB = (b.conflicts?.[0]?.integrations || []).map((i) => i.companyId).sort();
    if (JSON.stringify(idsA) !== JSON.stringify(idsB)) {
        issues.push(`companyIds: direct=${JSON.stringify(idsA)} http=${JSON.stringify(idsB)}`);
    }
    return issues;
}

const filters = parseArgs(process.argv.slice(2));
const direct = stableReportShape(await buildWhatsAppReconciliationReport(filters));

let http = null;
const issues = [];

if (!filters.baseUrl) {
    issues.push("No --baseUrl= — skipped HTTP comparison (direct report only).");
} else {
    const key = process.env.PLATFORM_API_KEY || "";
    if (!key) {
        issues.push("PLATFORM_API_KEY not set — skipped HTTP comparison.");
    } else {
        const params = new URLSearchParams();
        if (filters.phoneSuffix) params.set("phoneSuffix", filters.phoneSuffix);
        if (filters.phoneNumberId) params.set("phoneNumberId", filters.phoneNumberId);
        const url = `${filters.baseUrl}/api/platform/whatsapp-numbers/reconciliation?${params}`;
        const res = await fetch(url, { headers: { "x-platform-api-key": key } });
        if (!res.ok) {
            issues.push(`HTTP ${res.status}: ${await res.text()}`);
        } else {
            http = stableReportShape(await res.json());
            issues.push(...diffSummary(direct, http));
        }
    }
}

const result = {
    generatedAt: new Date().toISOString(),
    filters,
    parityOk: issues.length === 0,
    issues,
    direct,
    http,
};

console.log(JSON.stringify(result, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
