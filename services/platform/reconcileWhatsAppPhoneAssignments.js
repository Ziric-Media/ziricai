/**
 * G2 — Read-only WhatsApp Phone Number ID reconciliation (no mutations).
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { listWhatsAppPoolNumbers } from "./whatsappNumberPoolService.js";
import { findActiveWhatsAppIntegrationByPhoneNumberId } from "../tenants/integrationService.js";
import { maskPhoneNumberId } from "../tenants/integrationService.js";
import { normalizeRegistryRecord, deriveAllocationStatus, ALLOCATION_ASSIGNED } from "./whatsappGatewayRegistry.js";

const ACTIVE_INTEGRATION_STATUSES = new Set(["active", "connected"]);

function companyIdFromPath(path) {
    const parts = String(path || "").split("/");
    const idx = parts.indexOf("companies");
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

/**
 * All tenant WhatsApp integration docs that carry a phoneNumberId.
 */
export async function listTenantWhatsAppIntegrationsWithPhone() {
    const admin = getAdminFirestore();
    const snap = await admin
        .collectionGroup(TENANT_COLLECTIONS.INTEGRATIONS)
        .where("provider", "==", "whatsapp")
        .limit(500)
        .get();

    const rows = [];
    for (const doc of snap.docs) {
        const d = doc.data();
        if (!d.phoneNumberId) continue;
        const companyId = companyIdFromPath(doc.ref.path);
        const status = String(d.status || "").toLowerCase();
        const rawPhone = String(d.phoneNumberId).trim();
        rows.push({
            companyId,
            integrationDocId: doc.id,
            status: d.status || null,
            phoneNumberId: rawPhone,
            phoneNumberIdMasked: maskPhoneNumberId(rawPhone),
            phoneSuffix: rawPhone.slice(-4),
            credentialsSource: d.credentialsSource ?? null,
            displayPhoneNumber: d.displayPhoneNumber || null,
            connectionMethod: d.credentialsSource === "tenant" ? "byo" : "managed_or_unset",
            active: ACTIVE_INTEGRATION_STATUSES.has(status),
            updatedAt: d.updatedAt || d.configuredAt || null,
        });
    }
    return rows;
}

function classifyTenantRow(row, context) {
    const { canonicalKeepCompanyIds = new Set(["central-motors-rtb"]) } = context;
    if (row.connectionMethod === "byo") {
        return { classification: "needs_review", reason: "BYO tenant token path — exclude from managed pool remediation" };
    }
    if (!row.active) {
        return { classification: "inactive", reason: "Integration not active/connected" };
    }
    if (canonicalKeepCompanyIds.has(row.companyId)) {
        return { classification: "keep_active_candidate", reason: "Listed canonical backbone consumer" };
    }
    if (String(row.companyId || "").startsWith("p0-2") || String(row.companyId || "").startsWith("portal-")) {
        return { classification: "deactivate_candidate", reason: "Likely test or portal QA tenant" };
    }
    if (String(row.companyId || "").startsWith("demo-")) {
        return { classification: "needs_review", reason: "Demo tenant — confirm before any change" };
    }
    return { classification: "needs_review", reason: "Manual operator classification required" };
}

/**
 * @param {{ phoneNumberId?: string|null, phoneSuffix?: string|null }} filters
 */
export async function buildWhatsAppReconciliationReport(filters = {}) {
    const filterPhone = filters.phoneNumberId ? String(filters.phoneNumberId).trim() : null;
    const filterSuffix = filters.phoneSuffix ? String(filters.phoneSuffix).trim() : null;

    const [poolRaw, tenantRows] = await Promise.all([
        listWhatsAppPoolNumbers(),
        listTenantWhatsAppIntegrationsWithPhone(),
    ]);

    const poolByPhone = new Map();
    for (const p of poolRaw) {
        if (p.phoneNumberId) poolByPhone.set(String(p.phoneNumberId), p);
    }

    const filtered = tenantRows.filter((row) => {
        if (filterPhone && row.phoneNumberId !== filterPhone) return false;
        if (filterSuffix && row.phoneSuffix !== filterSuffix) return false;
        return true;
    });

    /** @type {Map<string, { phoneNumberId: string, integrations: object[] }>} */
    const bySuffix = new Map();
    for (const row of filtered) {
        const bucket = row.phoneSuffix || "unknown";
        if (!bySuffix.has(bucket)) {
            bySuffix.set(bucket, { phoneNumberId: row.phoneNumberId, integrations: [] });
        }
        const group = bySuffix.get(bucket);
        if (!group.phoneNumberId.includes("*") && row.phoneNumberId.includes("*")) {
            // keep numeric id as canonical key when mixing masked legacy values
        } else if (group.phoneNumberId.includes("*") && !row.phoneNumberId.includes("*")) {
            group.phoneNumberId = row.phoneNumberId;
        }
        group.integrations.push(row);
    }

    if (filterPhone && !filtered.length) {
        bySuffix.set(filterPhone.slice(-4), { phoneNumberId: filterPhone, integrations: [] });
    }

    const conflicts = [];

    for (const [, { phoneNumberId, integrations }] of bySuffix.entries()) {
        const activeIntegrations = integrations.filter((i) => i.active);
        const poolDoc = poolByPhone.get(phoneNumberId) || null;
        const registry = poolDoc ? normalizeRegistryRecord({ ...poolDoc, id: poolDoc.id }) : null;
        const routingWinner = await findActiveWhatsAppIntegrationByPhoneNumberId(phoneNumberId);

        const registryAssigned =
            registry && deriveAllocationStatus(registry) === ALLOCATION_ASSIGNED
                ? registry.assignedCompanyId
                : null;

        const aligned =
            activeIntegrations.length <= 1 &&
            (!registryAssigned ||
                (activeIntegrations.length === 1 &&
                    activeIntegrations[0].companyId === registryAssigned)) &&
            (activeIntegrations.length === 0 ? !registryAssigned : true);

        const integrationClassifications = integrations.map((row) => {
            const { phoneNumberId: _omit, ...safe } = row;
            return {
                ...safe,
                ...classifyTenantRow(row, filters),
            };
        });

        conflicts.push({
            phoneNumberIdMasked: maskPhoneNumberId(phoneNumberId),
            phoneSuffix: String(phoneNumberId).slice(-4),
            activeIntegrationCount: activeIntegrations.length,
            totalIntegrationDocs: integrations.length,
            duplicateActiveRouting: activeIntegrations.length > 1,
            registry: registry
                ? {
                      poolId: registry.id,
                      allocationStatus: registry.allocationStatus,
                      assignedCompanyId: registry.assignedCompanyId,
                      legacyStatus: registry.status,
                  }
                : null,
            registryVsTenantsAligned: aligned,
            nondeterministicRoutingWinner: routingWinner
                ? {
                      companyId: routingWinner.companyId,
                      status: routingWinner.status,
                      note: "First active match from collection group query — not guaranteed unique",
                  }
                : null,
            integrations: integrationClassifications,
            recommendedOperatorActions: buildRecommendations({
                activeIntegrations,
                registry,
                aligned,
                integrationClassifications,
            }),
        });
    }

    conflicts.sort((a, b) => b.activeIntegrationCount - a.activeIntegrationCount);

    return {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        filters: { phoneNumberId: filterPhone, phoneSuffix: filterSuffix },
        summary: {
            phoneIdsInReport: conflicts.length,
            duplicateActivePhoneIds: conflicts.filter((c) => c.duplicateActiveRouting).length,
            registryMisaligned: conflicts.filter((c) => !c.registryVsTenantsAligned).length,
        },
        conflicts,
        poolInventoryCount: poolRaw.length,
    };
}

function buildRecommendations({ activeIntegrations, registry, aligned, integrationClassifications }) {
    const steps = [];
    if (activeIntegrations.length > 1) {
        steps.push(
            "P0: Multiple active/connected tenants on one Phone Number ID — pick single canonical owner before registry-first routing."
        );
    }
    if (!aligned && registry) {
        steps.push(
            "Update registry assignedCompanyId/allocationStatus OR deactivate stray tenant integrations — operator approval required (no auto-fix)."
        );
    }
    if (!registry && activeIntegrations.length > 0) {
        steps.push("Create or upsert platform/whatsapp/numbers row for this phoneNumberId.");
    }
    const candidates = integrationClassifications.filter((i) => i.classification === "deactivate_candidate");
    if (candidates.length) {
        steps.push(
            `Review deactivate_candidate tenants: ${candidates.map((c) => c.companyId).join(", ")}`
        );
    }
    if (!steps.length && aligned) {
        steps.push("No remediation required for this phone ID.");
    }
    return steps;
}
