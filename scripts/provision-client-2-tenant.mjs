#!/usr/bin/env node
/**
 * Generic operator tenant provisioning — TENANT-PROVISIONING-1.
 * Provisions a supplied companyId for an existing Firebase Auth owner (no Auth user creation).
 *
 * Env:
 *   CLIENT2_COMPANY_ID, CLIENT2_COMPANY_NAME, CLIENT2_OWNER_UID, CLIENT2_OWNER_EMAIL (required)
 *   CLIENT2_INDUSTRY, CLIENT2_PLAN (optional; plan defaults to trial)
 *   CLIENT2_OWNER_NAME (optional)
 *
 * Requires Firebase Admin + Firestore storage backend.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { DEMO_COMPANY_ID } from "../services/core/dataMode.js";
import { isCentralMotorsPilotMode } from "../services/storage/centralMotorsPilot.js";
import { isValidCompanyId } from "../services/auth/validateInput.js";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { getStorageAdapter, getStorageBackendName } from "../services/storage/storageAdapter.js";
import {
    provisionCompany,
    isCanonicalProvisioningComplete,
} from "../services/platform/provisioningService.js";
import { getCompany, getProvisioningLinks } from "../services/tenants/companyService.js";
import { upsertGlobalUserProfile, upsertOwnerMembership } from "../services/auth/authService.js";
import { listAiEmployees, getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";
import { getTenantBilling } from "../services/payments/billingService.js";
import {
    captureRtbFingerprint,
    rtbFingerprintsEqual,
    verifyTenantContract,
} from "./verify-tenant-provisioning-1.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const RESERVED_COMPANY_IDS = new Set([
    CENTRAL_MOTORS_RTB_COMPANY_ID,
    DEMO_COMPANY_ID,
    "demo-econo-funerals",
]);

function parseArg(name) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : "";
}

function loadInputs() {
    return {
        companyId: (parseArg("company-id") || process.env.CLIENT2_COMPANY_ID || "").trim(),
        companyName: (parseArg("company-name") || process.env.CLIENT2_COMPANY_NAME || "").trim(),
        ownerUid: (parseArg("owner-uid") || process.env.CLIENT2_OWNER_UID || "").trim(),
        ownerEmail: (parseArg("owner-email") || process.env.CLIENT2_OWNER_EMAIL || "").trim().toLowerCase(),
        ownerName: (parseArg("owner-name") || process.env.CLIENT2_OWNER_NAME || "").trim(),
        industry: (parseArg("industry") || process.env.CLIENT2_INDUSTRY || "").trim(),
        plan: (parseArg("plan") || process.env.CLIENT2_PLAN || "trial").trim(),
    };
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertCompanyIdAllowed(companyId) {
    if (!companyId) throw new Error("companyId is required");
    if (!isValidCompanyId(companyId)) throw new Error("Invalid companyId format");
    if (RESERVED_COMPANY_IDS.has(companyId)) {
        throw new Error(`companyId "${companyId}" is reserved (pilot/demo tenant)`);
    }
    if (/^central-motors/i.test(companyId)) {
        throw new Error(`companyId "${companyId}" is not allowed (Central Motors namespace)`);
    }
    const defaultCo = (process.env.DEFAULT_COMPANY_ID || "").trim();
    if (defaultCo && companyId === defaultCo) {
        throw new Error(`companyId must not equal DEFAULT_COMPANY_ID (${defaultCo})`);
    }
}

function assertPilotEnvSafe() {
    if (isCentralMotorsPilotMode()) {
        throw new Error(
            "CENTRAL_MOTORS_PILOT is enabled — disable for operator provisioning of a new tenant"
        );
    }
}

async function buildSnapshot(companyId) {
    const company = await getCompany(companyId);
    const provisioning = await getProvisioningLinks(companyId);
    const defaultAgent = await getDefaultAiEmployee(companyId);
    const agents = await listAiEmployees(companyId);
    const docs = await listKnowledgeDocuments(companyId);
    const billing = await getTenantBilling(companyId);
    return {
        agentId: defaultAgent?.id || provisioning?.links?.agentId || null,
        knowledgeBaseId: provisioning?.links?.knowledgeBaseId || `kb-${companyId}`,
        agentCount: agents.length,
        defaultAgentCount: agents.filter((a) => a.isDefault).length,
        knowledgeDocumentCount: docs.length,
        company: company
            ? { name: company.name, industry: company.industry, plan: company.plan, status: company.status }
            : null,
        billing: billing ? { planId: billing.planId, status: billing.status } : null,
        marketplaceEnabled: company?.settings?.marketplace?.enabled === true,
    };
}

async function main() {
    const input = loadInputs();
    const partial = { provisioned: false, profile: false, membership: false };

    try {
        assertPilotEnvSafe();
        assertCompanyIdAllowed(input.companyId);
        if (!input.companyName) throw new Error("companyName is required");
        if (!input.ownerUid) throw new Error("ownerUid is required");
        if (!input.ownerEmail || !validateEmail(input.ownerEmail)) {
            throw new Error("ownerEmail is required and must be valid");
        }

        if (!hasAdminCredentials()) {
            console.log(JSON.stringify({ ok: false, error: "NO_ADMIN_CREDENTIALS", partial }, null, 2));
            process.exit(1);
        }

        getAdminFirestore();
        if (admin.apps.length === 0) {
            console.log(JSON.stringify({ ok: false, error: "ADMIN_APP_UNAVAILABLE", partial }, null, 2));
            process.exit(1);
        }

        try {
            await admin.auth().getUser(input.ownerUid);
        } catch {
            console.log(
                JSON.stringify(
                    { ok: false, error: "OWNER_AUTH_USER_NOT_FOUND", ownerUid: input.ownerUid, partial },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        await getStorageAdapter();
        const backend = await getStorageBackendName();
        if (backend !== "firestore") {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "STORAGE_BACKEND_MUST_BE_FIRESTORE",
                        backend,
                        partial,
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        const rtbBefore = await captureRtbFingerprint();

        const existing = await getProvisioningLinks(input.companyId);
        let mode = "created";
        let provisionResult;

        if (isCanonicalProvisioningComplete(existing)) {
            mode = "alreadyProvisioned";
            provisionResult = {
                companyId: input.companyId,
                links: existing.links,
                provisioned: existing.resources || [],
                agentId: existing.links.agentId,
                knowledgeBaseId: existing.links.knowledgeBaseId,
                alreadyProvisioned: true,
            };
        } else {
            provisionResult = await provisionCompany(input.companyId, {
                name: input.companyName,
                industry: input.industry,
                plan: input.plan,
                status: "active",
                email: input.ownerEmail,
                ownerEmail: input.ownerEmail,
                owner: input.ownerName || "Owner",
                ownerName: input.ownerName || "Owner",
                ownerUid: input.ownerUid,
                ownerId: input.ownerUid,
            });
            partial.provisioned = true;
            mode = provisionResult.alreadyProvisioned ? "alreadyProvisioned" : "created";
        }

        const ownerDisplay = input.ownerName || "Owner";
        try {
            await upsertGlobalUserProfile(input.ownerUid, {
                email: input.ownerEmail,
                fullName: ownerDisplay,
                name: ownerDisplay,
                role: "owner",
                companyId: input.companyId,
                company: input.companyId,
                status: "active",
            });
            partial.profile = true;
        } catch (err) {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "GLOBAL_PROFILE_WRITE_FAILED",
                        message: err.message,
                        mode,
                        partial,
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        try {
            await upsertOwnerMembership(input.ownerUid, input.companyId, {
                email: input.ownerEmail,
                fullName: ownerDisplay,
                role: "owner",
                status: "active",
            });
            partial.membership = true;
        } catch (err) {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "TENANT_MEMBERSHIP_WRITE_FAILED",
                        message: err.message,
                        mode,
                        partial,
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        const rtbAfter = await captureRtbFingerprint();
        const rtbUnchanged = rtbFingerprintsEqual(rtbBefore, rtbAfter);
        if (!rtbUnchanged) {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "RTB_FINGERPRINT_CHANGED",
                        mode,
                        partial,
                        rtbGuard: { unchanged: false },
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        const contract = await verifyTenantContract({
            companyId: input.companyId,
            ownerUid: input.ownerUid,
            expectName: input.companyName,
            expectIndustry: input.industry,
            expectPlan: input.plan,
            expectOwnerEmail: input.ownerEmail,
        });

        if (!contract.ok) {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "POST_PROVISION_VERIFICATION_FAILED",
                        mode,
                        partial,
                        verification: contract.results.filter((r) => !r.ok),
                        rtbGuard: { unchanged: true },
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        const snapshot = await buildSnapshot(input.companyId);
        const company = await getCompany(input.companyId);
        const provisioning = await getProvisioningLinks(input.companyId);
        const defaultAgent = await getDefaultAiEmployee(input.companyId);
        const billing = await getTenantBilling(input.companyId);

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    mode,
                    companyId: input.companyId,
                    company: {
                        name: company?.name,
                        industry: company?.industry,
                        plan: company?.plan,
                        status: company?.status,
                        provisionedAt: company?.provisionedAt,
                    },
                    provisioning: {
                        provisionedAt: provisioning?.provisionedAt,
                        resources: provisioning?.resources,
                        links: provisioning?.links,
                        complete: isCanonicalProvisioningComplete(provisioning),
                    },
                    agent: defaultAgent
                        ? {
                              id: defaultAgent.id,
                              name: defaultAgent.name,
                              isDefault: defaultAgent.isDefault,
                              knowledgeBaseId: defaultAgent.knowledgeBaseId,
                          }
                        : null,
                    knowledgeBaseId: snapshot.knowledgeBaseId,
                    knowledgeDocumentCount: snapshot.knowledgeDocumentCount,
                    billing: billing
                        ? { planId: billing.planId, status: billing.status, trialEndsAt: billing.trialEndsAt }
                        : null,
                    marketplace: { enabled: snapshot.marketplaceEnabled },
                    owner: {
                        uid: input.ownerUid,
                        email: input.ownerEmail,
                        profileBound: true,
                        membershipBound: true,
                    },
                    snapshot,
                    rtbGuard: { unchanged: true },
                    warnings:
                        snapshot.knowledgeDocumentCount === 0
                            ? ["No starter knowledge documents on Firestore adapter (KB shell only)"]
                            : [],
                },
                null,
                2
            )
        );
    } catch (err) {
        console.log(
            JSON.stringify(
                {
                    ok: false,
                    error: err.message || String(err),
                    partial,
                },
                null,
                2
            )
        );
        process.exit(1);
    }
}

if (process.argv[1]?.includes("provision-client-2-tenant")) {
    main();
}
