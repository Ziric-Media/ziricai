/**
 * G6 — Evidence-based WhatsApp Gateway readiness (configuration + behavioral).
 */
import crypto from "crypto";
import { getWhatsAppIntegration, maskPhoneNumberId } from "../tenants/integrationService.js";
import {
    assessRuntimeReadiness,
    WHATSAPP_STATUS_ACTIVE,
} from "../tenants/platformWhatsAppIntegrationService.js";
import { getDefaultAiEmployee } from "../tenants/aiEmployeeService.js";
import { findWhatsAppRegistryByPhoneNumberId } from "./whatsappNumberPoolService.js";
import {
    deriveAllocationStatus,
    ALLOCATION_ASSIGNED,
    ALLOCATION_AVAILABLE,
    ALLOCATION_SUSPENDED,
    REGISTRATION_REGISTERED,
} from "./whatsappGatewayRegistry.js";
import { resolveWhatsAppInboundCompanyId, getWhatsAppGatewayRoutingMode } from "./whatsappGatewayService.js";
import { scanWhatsAppGatewayProjectionDrift } from "./whatsappGatewayRecovery.js";
import { listGatewayProbeEvents } from "./whatsappGatewayProbeStore.js";
import {
    READINESS_STATE,
    READINESS_DIMENSION,
    CONFIGURATION_COMPLETE_STATE,
} from "./whatsappGatewayReadinessStates.js";

const ACTIVE_STATUSES = new Set(["active", "connected"]);

function dimension(id, state, { ok, evidence = {}, missing = [], remediation = null } = {}) {
    return {
        id,
        state,
        ok: Boolean(ok),
        evidence,
        missing,
        remediation,
    };
}

function hasRecentSuccessfulProbe(companyId, kind) {
    const events = listGatewayProbeEvents({ companyId, limit: 50 });
    return events.some((e) => e.kind === kind && e.success === true);
}

function hasBehavioralEvidence(companyId) {
    return (
        hasRecentSuccessfulProbe(companyId, "inbound_routing_simulated") ||
        hasRecentSuccessfulProbe(companyId, "inbound_routing_live") ||
        hasRecentSuccessfulProbe(companyId, "end_to_end_simulated") ||
        hasRecentSuccessfulProbe(companyId, "end_to_end_live")
    );
}

function webhookInfrastructureEvidence() {
    const verify = Boolean(process.env.VERIFY_TOKEN && String(process.env.VERIFY_TOKEN).trim());
    const secret = Boolean(process.env.META_APP_SECRET && String(process.env.META_APP_SECRET).trim());
    return {
        verifyTokenConfigured: verify,
        metaAppSecretConfigured: secret,
        note: "Infrastructure only — does not prove recent Meta POST traffic",
    };
}

/**
 * Evaluate readiness for a tenant company (managed or BYO).
 * @param {string} companyId
 * @param {{ includeSimulatedRouting?: boolean }} [opts]
 */
export async function evaluateCompanyWhatsAppReadiness(companyId, opts = {}) {
    const correlationId = crypto.randomUUID();
    const integration = await getWhatsAppIntegration(companyId);
    const dimensions = [];
    const remediation = [];

    if (!integration?.id) {
        dimensions.push(
            dimension(READINESS_DIMENSION.META_REGISTRATION, READINESS_STATE.NOT_CONFIGURED, {
                ok: false,
                remediation: "Register or assign a WhatsApp integration for this workspace.",
            })
        );
        return finalizeReport({
            scope: "company",
            companyId,
            correlationId,
            dimensions,
            phoneNumberId: null,
            credentialsSource: null,
        });
    }

    const credentialsSource = integration.credentialsSource || null;
    const phoneNumberId = integration.phoneNumberId ? String(integration.phoneNumberId) : null;
    const isManaged = String(credentialsSource || "").toLowerCase() === "env";
    const isByo = String(credentialsSource || "").toLowerCase() === "tenant";

    if (!phoneNumberId) {
        dimensions.push(
            dimension(READINESS_DIMENSION.META_REGISTRATION, READINESS_STATE.NOT_REGISTERED, {
                ok: false,
                remediation: "Assign a Meta Phone Number ID via pool assign or approved connect flow.",
            })
        );
    } else {
        dimensions.push(
            dimension(READINESS_DIMENSION.META_REGISTRATION, READINESS_STATE.AVAILABLE, {
                ok: true,
                evidence: { phoneNumberIdMasked: maskPhoneNumberId(phoneNumberId) },
            })
        );
    }

    const runtime = assessRuntimeReadiness(integration);
    dimensions.push(
        dimension(
            READINESS_DIMENSION.PLATFORM_CREDENTIALS,
            runtime.runtimeReady ? READINESS_STATE.AVAILABLE : READINESS_STATE.CREDENTIALS_UNAVAILABLE,
            {
                ok: runtime.runtimeReady,
                missing: runtime.missing,
                evidence: { credentialsSource },
                remediation: runtime.runtimeReady
                    ? null
                    : `Resolve credential gaps: ${runtime.missing.join(", ")}`,
            }
        )
    );

    let registry = null;
    if (phoneNumberId) {
        registry = await findWhatsAppRegistryByPhoneNumberId(phoneNumberId);
    }

    if (isManaged) {
        const allocation = registry ? deriveAllocationStatus(registry) : null;
        if (allocation === ALLOCATION_SUSPENDED) {
            dimensions.push(
                dimension(READINESS_DIMENSION.REGISTRY_ALLOCATION, READINESS_STATE.SUSPENDED, {
                    ok: false,
                    remediation: "Number is suspended — run recovery / operator review before use.",
                })
            );
        } else if (
            !registry ||
            allocation !== ALLOCATION_ASSIGNED ||
            registry.assignedCompanyId !== companyId
        ) {
            dimensions.push(
                dimension(READINESS_DIMENSION.REGISTRY_ALLOCATION, READINESS_STATE.ALLOCATION_REQUIRED, {
                    ok: false,
                    evidence: {
                        allocationStatus: allocation,
                        assignedCompanyId: registry?.assignedCompanyId || null,
                    },
                    remediation: "Assign this Phone Number ID from the WhatsApp pool to this tenant.",
                })
            );
        } else {
            dimensions.push(
                dimension(READINESS_DIMENSION.REGISTRY_ALLOCATION, READINESS_STATE.OPERATIONAL, {
                    ok: true,
                    evidence: {
                        poolId: registry.id,
                        allocationStatus: allocation,
                    },
                })
            );
        }

        const projectionOk =
            registry &&
            allocation === ALLOCATION_ASSIGNED &&
            registry.assignedCompanyId === companyId &&
            String(registry.phoneNumberId) === phoneNumberId &&
            ACTIVE_STATUSES.has(String(integration.status || "").toLowerCase());
        dimensions.push(
            dimension(
                READINESS_DIMENSION.PROJECTION_CONSISTENCY,
                projectionOk ? READINESS_STATE.OPERATIONAL : READINESS_STATE.PROJECTION_DRIFT,
                {
                    ok: projectionOk,
                    evidence: {
                        integrationStatus: integration.status,
                        registryPhoneSuffix: registry?.phoneNumberId?.slice(-4) || null,
                    },
                    remediation: projectionOk
                        ? null
                        : "Reconcile registry assignment with tenant integration (see projection-drift scan).",
                }
            )
        );
    } else if (isByo) {
        dimensions.push(
            dimension(READINESS_DIMENSION.REGISTRY_ALLOCATION, READINESS_STATE.AVAILABLE, {
                ok: true,
                evidence: { note: "BYO path — registry allocation not required" },
            })
        );
        dimensions.push(
            dimension(READINESS_DIMENSION.PROJECTION_CONSISTENCY, READINESS_STATE.AVAILABLE, {
                ok: true,
                evidence: { note: "BYO tenant integration is authoritative for credentials" },
            })
        );
    }

    const wh = webhookInfrastructureEvidence();
    const webhookOk = wh.verifyTokenConfigured && wh.metaAppSecretConfigured;
    dimensions.push(
        dimension(
            READINESS_DIMENSION.WEBHOOK_INFRASTRUCTURE,
            webhookOk ? READINESS_STATE.AVAILABLE : READINESS_STATE.WEBHOOK_UNVERIFIED,
            {
                ok: webhookOk,
                evidence: wh,
                remediation: webhookOk
                    ? null
                    : "Configure VERIFY_TOKEN and META_APP_SECRET on the API host.",
            }
        )
    );

    if (phoneNumberId && opts.includeSimulatedRouting !== false) {
        const routed = await resolveWhatsAppInboundCompanyId(phoneNumberId);
        const routingOk = routed.companyId === companyId;
        dimensions.push(
            dimension(
                READINESS_DIMENSION.INBOUND_ROUTING,
                routingOk ? READINESS_STATE.OPERATIONAL : READINESS_STATE.ROUTING_UNVERIFIED,
                {
                    ok: routingOk,
                    evidence: {
                        gatewayMode: getWhatsAppGatewayRoutingMode(),
                        gatewayVia: routed.via,
                        resolvedCompanyId: routed.companyId,
                    },
                    remediation: routingOk
                        ? null
                        : "Inbound routing does not resolve to this tenant — check registry and integration status.",
                }
            )
        );
        dimensions.push(
            dimension(READINESS_DIMENSION.TENANT_RESOLUTION, READINESS_STATE.OPERATIONAL, {
                ok: routingOk,
                evidence: { expectedCompanyId: companyId, resolvedCompanyId: routed.companyId },
            })
        );
    }

    let sarahOk = false;
    try {
        const agent = await getDefaultAiEmployee(companyId);
        sarahOk = Boolean(agent?.id || agent?.agentId);
    } catch {
        sarahOk = false;
    }
    dimensions.push(
        dimension(
            READINESS_DIMENSION.SARAH_AVAILABILITY,
            sarahOk ? READINESS_STATE.OPERATIONAL : READINESS_STATE.SARAH_UNAVAILABLE,
            {
                ok: sarahOk,
                remediation: sarahOk ? null : "Configure default Sarah / AI employee for this tenant.",
            }
        )
    );

    const outboundOk =
        runtime.runtimeReady &&
        phoneNumberId &&
        (isByo ||
            (registry &&
                deriveAllocationStatus(registry) === ALLOCATION_ASSIGNED &&
                registry.assignedCompanyId === companyId));
    dimensions.push(
        dimension(
            READINESS_DIMENSION.OUTBOUND_CAPABILITY,
            outboundOk ? READINESS_STATE.ROUTING_UNVERIFIED : READINESS_STATE.OUTBOUND_UNVERIFIED,
            {
                ok: outboundOk,
                evidence: {
                    note: "Configuration gate only — not a live Graph send",
                    integrationActive: integration.status === WHATSAPP_STATUS_ACTIVE,
                },
                remediation: outboundOk
                    ? null
                    : "Complete allocation and credentials before outbound verification.",
            }
        )
    );

    const behavioral = hasBehavioralEvidence(companyId);
    const e2eOk =
        behavioral &&
        hasRecentSuccessfulProbe(companyId, "end_to_end_live") &&
        hasRecentSuccessfulProbe(companyId, "end_to_end_simulated");
    dimensions.push(
        dimension(
            READINESS_DIMENSION.END_TO_END,
            e2eOk
                ? READINESS_STATE.OPERATIONAL
                : behavioral
                  ? READINESS_STATE.DEGRADED
                  : READINESS_STATE.ROUTING_UNVERIFIED,
            {
                ok: e2eOk,
                evidence: {
                    behavioralProbeRecorded: behavioral,
                    note: "Requires recorded probe events — live E2E needs separate authorization",
                },
                remediation: e2eOk
                    ? null
                    : "Run authorized simulated or live probes to establish end-to-end evidence.",
            }
        )
    );

    for (const d of dimensions) {
        if (d.remediation) remediation.push(d.remediation);
    }

    return finalizeReport({
        scope: "company",
        companyId,
        correlationId,
        dimensions,
        phoneNumberId,
        credentialsSource,
        remediation,
    });
}

function finalizeReport(ctx) {
    const { dimensions, companyId, correlationId, phoneNumberId, credentialsSource, remediation, scope } =
        ctx;
    const failed = dimensions.filter((d) => !d.ok);
    const behavioralEvidence = companyId ? hasBehavioralEvidence(companyId) : false;

    let overallState = READINESS_STATE.NOT_CONFIGURED;
    if (dimensions.some((d) => d.state === READINESS_STATE.SUSPENDED)) {
        overallState = READINESS_STATE.SUSPENDED;
    } else if (dimensions.some((d) => d.state === READINESS_STATE.PROJECTION_DRIFT)) {
        overallState = READINESS_STATE.PROJECTION_DRIFT;
    } else if (dimensions.some((d) => d.state === READINESS_STATE.ALLOCATION_REQUIRED)) {
        overallState = READINESS_STATE.ALLOCATION_REQUIRED;
    } else if (dimensions.some((d) => d.state === READINESS_STATE.CREDENTIALS_UNAVAILABLE)) {
        overallState = READINESS_STATE.CREDENTIALS_UNAVAILABLE;
    } else if (dimensions.some((d) => d.state === READINESS_STATE.SARAH_UNAVAILABLE)) {
        overallState = READINESS_STATE.SARAH_UNAVAILABLE;
    } else if (failed.length === 0 && behavioralEvidence) {
        const e2e = dimensions.find((d) => d.id === READINESS_DIMENSION.END_TO_END);
        overallState =
            e2e?.state === READINESS_STATE.OPERATIONAL
                ? READINESS_STATE.OPERATIONAL
                : READINESS_STATE.DEGRADED;
    } else if (failed.length === 0) {
        overallState = CONFIGURATION_COMPLETE_STATE;
    } else {
        overallState = READINESS_STATE.DEGRADED;
    }

    const operational =
        overallState === READINESS_STATE.OPERATIONAL &&
        behavioralEvidence &&
        dimensions.every((d) => d.ok);

    return {
        generatedAt: new Date().toISOString(),
        scope,
        companyId: companyId || null,
        correlationId,
        phoneNumberIdMasked: phoneNumberId ? maskPhoneNumberId(phoneNumberId) : null,
        credentialsSource,
        gatewayRoutingMode: getWhatsAppGatewayRoutingMode(),
        overallState,
        operational,
        configurationComplete: failed.length === 0,
        behavioralEvidence,
        dimensions,
        remediation: [...new Set(remediation || [])],
        evidenceClass: operational ? "behavioral" : "configuration",
        lastProbes: companyId ? listGatewayProbeEvents({ companyId, limit: 5 }) : [],
    };
}

/** Platform-level gateway health (read-only). */
export async function evaluatePlatformWhatsAppGatewayHealth() {
    const drift = await scanWhatsAppGatewayProjectionDrift();
    return {
        generatedAt: new Date().toISOString(),
        gatewayRoutingMode: getWhatsAppGatewayRoutingMode(),
        g5Flags: {
            assignTransactions: String(process.env.WHATSAPP_GATEWAY_ASSIGN_TRANSACTIONS || "false"),
            strictProjection: String(process.env.WHATSAPP_GATEWAY_STRICT_PROJECTION || "false"),
        },
        liveProbesAuthorized: String(process.env.WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED || "false"),
        projectionDrift: drift.summary,
        driftIssues: drift.issues,
        note: "Does not declare any tenant OPERATIONAL without company-scoped readiness.",
    };
}
