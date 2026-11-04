#!/usr/bin/env node
/**
 * G3 — Operator-approved duplicate remediation for Phone Number ID …3699.
 * Deactivates approved p0-2 duplicates, then assigns registry to central-motors-rtb.
 *
 * Usage:
 *   node scripts/g3-execute-3699-remediation.mjs --snapshot-only
 *   node scripts/g3-execute-3699-remediation.mjs --execute --authorization=G3
 *
 * npx @railway/cli run node scripts/g3-execute-3699-remediation.mjs --execute --authorization=G3
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { TENANT_COLLECTIONS } from "../services/database/schema.js";
import { buildWhatsAppReconciliationReport } from "../services/platform/reconcileWhatsAppPhoneAssignments.js";
import {
    assignWhatsAppPoolNumberToCompany,
    listWhatsAppPoolNumbers,
} from "../services/platform/whatsappNumberPoolService.js";
import {
    disconnectIntegration,
    invalidatePhoneResolutionCache,
} from "../services/tenants/integrationService.js";
import { WHATSAPP_STATUS_DISCONNECTED } from "../services/tenants/platformWhatsAppIntegrationService.js";
import { deriveAllocationStatus, ALLOCATION_ASSIGNED } from "../services/platform/whatsappGatewayRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const KEEP_COMPANY_ID = "central-motors-rtb";
const POOL_NUMBER_ID = "wa-env-1209265748933699";
const PHONE_SUFFIX = "3699";
const OPERATOR = "g3-execute-3699-remediation";
const REASON = "G3 authorized duplicate 3699 remediation (2026-11-01)";

/** From G2 baseline — explicit doc ids for non-canonical whatsapp docs. */
const DEACTIVATE_TARGETS = [
    { companyId: "p0-2-final-muaguvq8-usmg", integrationDocId: "6r1ETG9GdBaQkYixZGkt" },
    { companyId: "p0-2-final-muagwqwu-wnn1", integrationDocId: "gJcnoaoB6LdohKGfHQm0" },
    { companyId: "p0-2c-live-muag3zbz-3vzt", integrationDocId: "QQqrFemgCc38vnTJronN" },
];

const FORBIDDEN_TOUCH = new Set(["ziricai"]);

function parseArgs(argv) {
    return {
        execute: argv.includes("--execute"),
        snapshotOnly: argv.includes("--snapshot-only"),
        authorization: (argv.find((a) => a.startsWith("--authorization=")) || "").slice("--authorization=".length),
    };
}

function redactIntegration(data) {
    if (!data || typeof data !== "object") return data;
    const copy = { ...data };
    if (copy.accessToken) copy.accessToken = "[REDACTED]";
    if (copy.config?.accessToken) copy.config = { ...copy.config, accessToken: "[REDACTED]" };
    return copy;
}

async function loadSnapshot(companyId, integrationDocId) {
    const admin = getAdminFirestore();
    const intRef = admin.doc(`companies/${companyId}/integrations/${integrationDocId}`);
    const companyRef = admin.doc(`companies/${companyId}`);
    const [intSnap, companySnap] = await Promise.all([intRef.get(), companyRef.get()]);
    return {
        companyId,
        integrationDocId,
        integrationPath: intRef.path,
        integration: intSnap.exists ? redactIntegration(intSnap.data()) : null,
        company: companySnap.exists ? companySnap.data() : null,
        capturedAt: new Date().toISOString(),
    };
}

async function capturePreChangeSnapshots() {
    const companies = [
        { companyId: KEEP_COMPANY_ID, integrationDocId: "whatsapp" },
        ...DEACTIVATE_TARGETS,
    ];
    const snapshots = [];
    for (const row of companies) {
        snapshots.push(await loadSnapshot(row.companyId, row.integrationDocId));
    }
    return snapshots;
}

function writeAuditFile(relativePath, payload) {
    const full = path.join(ROOT, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(payload, null, 2), "utf8");
    return full;
}

async function assertPreconditions(report) {
    const conflict = report.conflicts?.find((c) => c.phoneSuffix === PHONE_SUFFIX);
    if (!conflict) throw new Error(`No conflict block for suffix ${PHONE_SUFFIX}`);
    if (conflict.activeIntegrationCount !== 4) {
        throw new Error(`Expected 4 active integrations, got ${conflict.activeIntegrationCount}`);
    }
    const activeIds = new Set(
        conflict.integrations.filter((i) => i.active).map((i) => i.companyId)
    );
    if (!activeIds.has(KEEP_COMPANY_ID)) {
        throw new Error(`Keep candidate ${KEEP_COMPANY_ID} is not active on ${PHONE_SUFFIX}`);
    }
    for (const t of DEACTIVATE_TARGETS) {
        if (!activeIds.has(t.companyId)) {
            throw new Error(`Expected active duplicate ${t.companyId} missing from report`);
        }
        if (FORBIDDEN_TOUCH.has(t.companyId)) {
            throw new Error(`Refusing to touch forbidden tenant ${t.companyId}`);
        }
    }
}

async function deactivateDuplicate(integrationDocId, companyId, phoneNumberId) {
    const before = await loadSnapshot(companyId, integrationDocId);
    if (!before.integration) {
        throw new Error(`Integration missing: ${companyId}/${integrationDocId}`);
    }
    const status = String(before.integration.status || "").toLowerCase();
    if (!["active", "connected"].includes(status)) {
        return { companyId, integrationDocId, skipped: true, reason: `already ${status}` };
    }
    await disconnectIntegration(companyId, integrationDocId);
    if (phoneNumberId) invalidatePhoneResolutionCache(phoneNumberId);
    const after = await loadSnapshot(companyId, integrationDocId);
    return {
        companyId,
        integrationDocId,
        previousStatus: before.integration.status,
        newStatus: after.integration?.status || WHATSAPP_STATUS_DISCONNECTED,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const reportBefore = await buildWhatsAppReconciliationReport({ phoneSuffix: PHONE_SUFFIX });
    await assertPreconditions(reportBefore);

    const snapshots = await capturePreChangeSnapshots();
    const snapshotPath = writeAuditFile(
        "docs/audit/g3-pre-change/snapshots-3699-2026-11-01.json",
        { reason: REASON, snapshots }
    );

    const result = {
        phase: args.execute ? "execute" : "snapshot-only",
        authorization: args.authorization || null,
        snapshotPath,
        reportBefore: {
            summary: reportBefore.summary,
            activeIntegrationCount: reportBefore.conflicts?.[0]?.activeIntegrationCount,
        },
        steps: [],
    };

    if (args.snapshotOnly || !args.execute) {
        console.log(JSON.stringify(result, null, 2));
        if (!args.execute) {
            console.error("Dry run complete. Pass --execute --authorization=G3 to apply changes.");
        }
        return;
    }

    if (args.authorization !== "G3") {
        throw new Error("Missing --authorization=G3");
    }

    const poolRows = await listWhatsAppPoolNumbers();
    const pool = poolRows.find((p) => p.id === POOL_NUMBER_ID);
    if (!pool?.phoneNumberId) {
        throw new Error(`Pool row ${POOL_NUMBER_ID} not found or missing phoneNumberId`);
    }
    const fullPhoneNumberId = String(pool.phoneNumberId);

    for (const target of DEACTIVATE_TARGETS) {
        if (FORBIDDEN_TOUCH.has(target.companyId)) continue;
        const step = await deactivateDuplicate(
            target.integrationDocId,
            target.companyId,
            fullPhoneNumberId
        );
        result.steps.push({ action: "deactivate", ...step });
    }

    const reportMid = await buildWhatsAppReconciliationReport({ phoneSuffix: PHONE_SUFFIX });
    const midConflict = reportMid.conflicts?.[0];
    if (midConflict?.activeIntegrationCount !== 1) {
        throw new Error(
            `After deactivate expected 1 active integration, got ${midConflict?.activeIntegrationCount}`
        );
    }
    const soleActive = midConflict.integrations.find((i) => i.active);
    if (soleActive?.companyId !== KEEP_COMPANY_ID) {
        throw new Error(`Remaining active tenant is ${soleActive?.companyId}, expected ${KEEP_COMPANY_ID}`);
    }

    result.steps.push({
        action: "verify_post_deactivate",
        activeIntegrationCount: midConflict.activeIntegrationCount,
        companyId: soleActive.companyId,
    });

    const assignResult = await assignWhatsAppPoolNumberToCompany({
        companyId: KEEP_COMPANY_ID,
        numberId: POOL_NUMBER_ID,
        activate: false,
        operatorId: OPERATOR,
        reason: REASON,
    });
    result.steps.push({ action: "registry_assign", success: assignResult.success, number: assignResult.number });

    const reportAfter = await buildWhatsAppReconciliationReport({ phoneSuffix: PHONE_SUFFIX });
    const afterConflict = reportAfter.conflicts?.[0];
    const registry = afterConflict?.registry;
    const aligned =
        registry &&
        deriveAllocationStatus(registry) === ALLOCATION_ASSIGNED &&
        registry.assignedCompanyId === KEEP_COMPANY_ID;

    result.reportAfter = {
        summary: reportAfter.summary,
        activeIntegrationCount: afterConflict?.activeIntegrationCount,
        registryVsTenantsAligned: afterConflict?.registryVsTenantsAligned,
        registryAssigned: aligned,
    };

    if (afterConflict?.activeIntegrationCount !== 1 || !aligned) {
        result.success = false;
        writeAuditFile("docs/audit/g3-post-change/remediation-3699-2026-11-01-FAILED.json", result);
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
    }

    result.success = true;
    const outPath = writeAuditFile("docs/audit/g3-post-change/remediation-3699-2026-11-01.json", result);
    result.auditPath = outPath;
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
    process.exit(1);
});
