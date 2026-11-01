/**
 * G5 — Assign/release orchestration (registry authority + tenant projection saga).
 */
import crypto from "crypto";
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import { platformWhatsAppNumberPath } from "../database/schema.js";
import { getCompany } from "../tenants/companyService.js";
import {
    registerPlatformWhatsAppIntegration,
    configurePlatformWhatsAppIntegration,
    activatePlatformWhatsAppIntegration,
    deactivatePlatformWhatsAppIntegration,
    WHATSAPP_STATUS_ACTIVE,
} from "../tenants/platformWhatsAppIntegrationService.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    getWhatsAppIntegration,
    getPlatformWhatsAppIntegrationWithReadiness,
    invalidatePhoneResolutionCache,
} from "../tenants/integrationService.js";
import {
    normalizeRegistryRecord,
    deriveAllocationStatus,
    registryPayloadForAssign,
    registryPayloadForRelease,
    registryPayloadForAssignRollback,
    registryPayloadForSuspended,
    sanitizeRegistryForApi,
    getIdempotentOperation,
    cacheIdempotentOperation,
    isAllocationAssignable,
    ALLOCATION_ASSIGNED,
    ALLOCATION_AVAILABLE,
    ALLOCATION_RETIRED,
    ALLOCATION_RESERVED,
    ALLOCATION_SUSPENDED,
} from "./whatsappGatewayRegistry.js";
import { readPoolRegistryDoc, writePoolRegistryDoc } from "./whatsappNumberPoolPoolIO.js";

function gatewayError(message, status = 400, code = undefined) {
    const err = new Error(message);
    err.status = status;
    if (code) err.code = code;
    return err;
}

export function isAssignTransactionsEnabled() {
    return String(process.env.WHATSAPP_GATEWAY_ASSIGN_TRANSACTIONS || "false").trim().toLowerCase() === "true";
}

export function resolveOperationId(input = {}) {
    const id = input.operationId || input.idempotencyKey || null;
    if (id && String(id).trim()) return String(id).trim().slice(0, 128);
    return crypto.randomUUID();
}

function assertAssignableAllocation(poolNumber, companyId) {
    const allocation = deriveAllocationStatus(poolNumber);
    if (String(poolNumber.status) === "retired" || allocation === ALLOCATION_RETIRED) {
        throw gatewayError("Pool number is retired", 409, "NUMBER_RETIRED");
    }
    if (allocation === ALLOCATION_RESERVED) {
        throw gatewayError("Pool number is reserved", 409, "NUMBER_RESERVED");
    }
    if (allocation === ALLOCATION_SUSPENDED) {
        throw gatewayError("Pool number is suspended", 409, "NUMBER_SUSPENDED");
    }
    if (allocation === ALLOCATION_ASSIGNED && poolNumber.assignedCompanyId !== companyId) {
        throw gatewayError(
            `Number is in use by tenant ${poolNumber.assignedCompanyId}`,
            409,
            "NUMBER_IN_USE"
        );
    }
    if (allocation === ALLOCATION_ASSIGNED && poolNumber.assignedCompanyId === companyId) {
        return { alreadyAssigned: true, allocation };
    }
    if (!isAllocationAssignable(allocation)) {
        throw gatewayError("Number is not available for assignment", 409, "NUMBER_NOT_AVAILABLE");
    }
    return { alreadyAssigned: false, allocation };
}

async function assertPhoneNotActiveElsewhere(companyId, phoneNumberId) {
    const other = await findActiveWhatsAppIntegrationByPhoneNumberId(String(phoneNumberId));
    if (other?.companyId && String(other.companyId) !== String(companyId)) {
        throw gatewayError("phoneNumberId is already active for another tenant", 409, "PHONE_IN_USE");
    }
}

async function claimRegistryAtomic(numberId, priorRecord, claimPayload) {
    const admin = getAdminFirestore();
    if (!admin || !isAssignTransactionsEnabled()) {
        await writePoolRegistryDoc(numberId, claimPayload);
        return readPoolRegistryDoc(numberId);
    }

    const ref = admin.doc(platformWhatsAppNumberPath(numberId));
    await admin.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw gatewayError("Pool number not found", 404, "POOL_NUMBER_NOT_FOUND");
        const current = normalizeRegistryRecord({ id: snap.id, ...snap.data() });
        const allocation = deriveAllocationStatus(current);
        const companyId = claimPayload.assignedCompanyId;
        if (allocation === ALLOCATION_ASSIGNED && current.assignedCompanyId !== companyId) {
            throw gatewayError(
                `Number is in use by tenant ${current.assignedCompanyId}`,
                409,
                "NUMBER_IN_USE"
            );
        }
        if (!isAllocationAssignable(allocation) && current.assignedCompanyId !== companyId) {
            throw gatewayError("Number is not available for assignment", 409, "NUMBER_NOT_AVAILABLE");
        }
        transaction.set(ref, { ...claimPayload, updatedAt: new Date().toISOString() }, { merge: true });
    });
    return readPoolRegistryDoc(numberId);
}

async function runAssignProjection({
    companyId,
    numberId,
    poolNumber,
    activate,
    priorRecord,
    operationId,
}) {
    let integration = await getWhatsAppIntegration(companyId);
    if (!integration?.id) {
        integration = await registerPlatformWhatsAppIntegration(companyId, {
            credentialsSource: poolNumber.credentialsSource || "env",
        });
    }

    const existingActive = await getWhatsAppIntegration(companyId);
    if (
        existingActive?.status === WHATSAPP_STATUS_ACTIVE &&
        existingActive.phoneNumberId &&
        existingActive.phoneNumberId !== poolNumber.phoneNumberId
    ) {
        throw gatewayError(
            "Company already has an active WhatsApp number; deactivate or release first",
            409,
            "TENANT_ALREADY_ACTIVE"
        );
    }

    await assertPhoneNotActiveElsewhere(companyId, poolNumber.phoneNumberId);

    await configurePlatformWhatsAppIntegration(companyId, {
        phoneNumberId: poolNumber.phoneNumberId,
        displayPhoneNumber: poolNumber.displayPhoneNumber || "",
        businessAccountId: poolNumber.businessAccountId || "",
        credentialsSource: poolNumber.credentialsSource || "env",
    });

    let activation = null;
    if (activate) {
        activation = await activatePlatformWhatsAppIntegration(companyId, {
            acknowledgeEnvCredentials: true,
            source: "whatsapp_number_pool",
            poolNumberId: numberId,
        });
    }

    return { activation };
}

/**
 * @param {object} input — same shape as assignWhatsAppPoolNumberToCompany
 */
export async function executeGatewayAssign(input = {}) {
    const companyId = String(input.companyId || "").trim();
    const numberId = String(input.numberId || "").trim();
    const activate = input.activate !== false;
    const operatorId = input.operatorId ? String(input.operatorId) : null;
    const reason = input.reason || "assign-pool-number";
    const operationId = resolveOperationId(input);

    if (!companyId) throw gatewayError("companyId is required", 400);
    if (!numberId) throw gatewayError("numberId is required", 400);

    const company = await getCompany(companyId);
    if (!company) throw gatewayError("Company not found", 404, "COMPANY_NOT_FOUND");

    const poolNumber = await readPoolRegistryDoc(numberId);
    if (!poolNumber) throw gatewayError("Pool number not found", 404, "POOL_NUMBER_NOT_FOUND");

    const cached = getIdempotentOperation(poolNumber, operationId);
    if (cached?.action === "assign" && cached.outcome === "success") {
        const readiness = await getPlatformWhatsAppIntegrationWithReadiness(companyId);
        const leased = await readPoolRegistryDoc(numberId);
        return {
            success: true,
            idempotentReplay: true,
            operationId,
            companyId,
            number: sanitizeRegistryForApi(leased),
            integration: readiness?.integration || null,
            runtimeReady: readiness?.runtimeReady ?? null,
            missing: readiness?.missing || [],
            activated: Boolean(cached.activated),
        };
    }

    const { alreadyAssigned } = assertAssignableAllocation(poolNumber, companyId);
    const priorRecord = poolNumber;
    const leaseId = poolNumber.leaseId || crypto.randomBytes(6).toString("hex");

    let claimed = poolNumber;
    if (!alreadyAssigned) {
        const claimPayload = registryPayloadForAssign(poolNumber, {
            companyId,
            leaseId,
            operatorId,
            reason,
            operationId,
        });
        claimed = await claimRegistryAtomic(numberId, priorRecord, claimPayload);
    }

    try {
        await runAssignProjection({
            companyId,
            numberId,
            poolNumber: claimed,
            activate,
            priorRecord,
            operationId,
        });

        const leased = await readPoolRegistryDoc(numberId);
        const idempotencyCache = cacheIdempotentOperation(leased, operationId, {
            action: "assign",
            outcome: "success",
            companyId,
            activated: activate,
        });
        await writePoolRegistryDoc(numberId, { idempotencyCache });

        const readiness = await getPlatformWhatsAppIntegrationWithReadiness(companyId);
        const finalDoc = await readPoolRegistryDoc(numberId);

        return {
            success: true,
            operationId,
            companyId,
            number: sanitizeRegistryForApi(finalDoc),
            integration: readiness?.integration || null,
            runtimeReady: readiness?.runtimeReady ?? null,
            missing: readiness?.missing || [],
            activated: Boolean(activate),
        };
    } catch (err) {
        const current = await readPoolRegistryDoc(numberId);
        if (
            current &&
            deriveAllocationStatus(current) === ALLOCATION_ASSIGNED &&
            current.assignedCompanyId === companyId &&
            !alreadyAssigned
        ) {
            await writePoolRegistryDoc(
                numberId,
                registryPayloadForAssignRollback(priorRecord, {
                    operationId,
                    reason: err.message,
                })
            );
        }
        throw err;
    }
}

async function clearTenantProjection(assignedCompanyId, poolNumber) {
    if (!assignedCompanyId) return;
    const integration = await getWhatsAppIntegration(assignedCompanyId);
    if (!integration?.id) return;
    if (String(integration.phoneNumberId) !== String(poolNumber.phoneNumberId)) return;

    if (integration.status === WHATSAPP_STATUS_ACTIVE) {
        await deactivatePlatformWhatsAppIntegration(assignedCompanyId, {
            reason: "Pool number released",
        });
    }
    await configurePlatformWhatsAppIntegration(assignedCompanyId, {
        phoneNumberId: "",
        displayPhoneNumber: "",
    });
    invalidatePhoneResolutionCache(poolNumber.phoneNumberId);
}

/**
 * @param {object} input — numberId, companyId (optional owner check), operatorId, reason, operationId
 */
export async function executeGatewayRelease(input = {}) {
    const numberId = input.numberId ? String(input.numberId).trim() : null;
    const companyId = input.companyId ? String(input.companyId).trim() : null;
    const operatorId = input.operatorId ? String(input.operatorId) : null;
    const reason = input.reason || "Pool number released";
    const operationId = resolveOperationId(input);

    let poolNumber = null;
    if (numberId) {
        poolNumber = await readPoolRegistryDoc(numberId);
    } else if (companyId) {
        const { listWhatsAppPoolNumbers } = await import("./whatsappNumberPoolService.js");
        const all = await listWhatsAppPoolNumbers({ status: "in_use" });
        const match = all.find((n) => n.assignedCompanyId === companyId);
        if (match) poolNumber = await readPoolRegistryDoc(match.id);
    }

    if (!poolNumber) throw gatewayError("Pool number assignment not found", 404, "POOL_NUMBER_NOT_FOUND");

    const resolvedNumberId = poolNumber.id;

    const cached = getIdempotentOperation(poolNumber, operationId);
    if (cached?.action === "release" && cached.outcome === "success") {
        const released = await readPoolRegistryDoc(resolvedNumberId);
        return {
            success: true,
            idempotentReplay: true,
            operationId,
            number: sanitizeRegistryForApi(released),
            previousCompanyId: cached.previousCompanyId || null,
        };
    }

    const assignedCompanyId = poolNumber.assignedCompanyId;
    const allocation = deriveAllocationStatus(poolNumber);

    if (companyId && assignedCompanyId && companyId !== assignedCompanyId) {
        throw gatewayError(
            "Release rejected: number is not assigned to the specified company",
            403,
            "RELEASE_OWNER_MISMATCH"
        );
    }

    if (allocation === ALLOCATION_AVAILABLE && !assignedCompanyId) {
        return {
            success: true,
            operationId,
            idempotentReplay: true,
            number: sanitizeRegistryForApi(poolNumber),
            previousCompanyId: null,
        };
    }

    const previousCompanyId = assignedCompanyId || null;

    try {
        await clearTenantProjection(assignedCompanyId, poolNumber);
    } catch (err) {
        throw gatewayError(`Tenant release step failed: ${err.message}`, 500, "RELEASE_PROJECTION_FAILED");
    }

    try {
        const releasedPayload = registryPayloadForRelease(poolNumber, {
            operatorId,
            reason,
            operationId,
        });
        const idempotencyCache = cacheIdempotentOperation(poolNumber, operationId, {
            action: "release",
            outcome: "success",
            previousCompanyId,
        });
        releasedPayload.idempotencyCache = idempotencyCache;
        await writePoolRegistryDoc(resolvedNumberId, releasedPayload);
    } catch (err) {
        await writePoolRegistryDoc(
            resolvedNumberId,
            registryPayloadForSuspended(poolNumber, {
                operatorId,
                reason: `Registry release failed after tenant cleared: ${err.message}`,
                operationId,
            })
        );
        throw gatewayError("Registry release failed; number marked suspended for recovery", 500, "RELEASE_REGISTRY_FAILED");
    }

    const released = await readPoolRegistryDoc(resolvedNumberId);
    return {
        success: true,
        operationId,
        number: sanitizeRegistryForApi(released),
        previousCompanyId,
    };
}
