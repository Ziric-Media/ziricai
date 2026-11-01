/**
 * G6 — Controlled behavioral probes (simulated by default; live requires explicit authorization).
 */
import {
    resolveWhatsAppInboundCompanyId,
    assertManagedOutboundRegistryAllowed,
} from "./whatsappGatewayService.js";
import { maskPhoneNumberId } from "../tenants/integrationService.js";
import { recordGatewayProbeEvent } from "./whatsappGatewayProbeStore.js";

export function isLiveWhatsAppProbeAuthorized() {
    return (
        String(process.env.WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED || "")
            .trim()
            .toLowerCase() === "true"
    );
}

/**
 * Live Meta send/receive is blocked unless WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED=true
 * and approved recipients are configured (future: WHATSAPP_GATEWAY_PROBE_RECIPIENTS).
 */
export function assertLiveProbeAllowed() {
    if (!isLiveWhatsAppProbeAuthorized()) {
        const err = new Error(
            "Live WhatsApp probes are not authorized. Set WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED=true only with explicit programme approval."
        );
        err.code = "LIVE_PROBE_NOT_AUTHORIZED";
        err.status = 403;
        throw err;
    }
}

/**
 * Simulated inbound routing probe (no Meta traffic).
 */
export async function simulateInboundRoutingProbe({
    phoneNumberId,
    expectedCompanyId,
    correlationId = null,
    operatorId = null,
} = {}) {
    const routed = await resolveWhatsAppInboundCompanyId(phoneNumberId);
    const ok = Boolean(expectedCompanyId && routed.companyId === expectedCompanyId);
    const event = recordGatewayProbeEvent({
        kind: "inbound_routing_simulated",
        correlationId,
        operatorId,
        phoneNumberIdSuffix: phoneNumberId ? String(phoneNumberId).slice(-4) : null,
        expectedCompanyId: expectedCompanyId || null,
        resolvedCompanyId: routed.companyId,
        gatewayMode: routed.mode,
        gatewayVia: routed.via,
        success: ok,
        live: false,
    });
    return {
        simulated: true,
        success: ok,
        phoneNumberIdMasked: maskPhoneNumberId(phoneNumberId),
        expectedCompanyId,
        resolvedCompanyId: routed.companyId,
        routing: routed,
        probeEventId: event.id,
    };
}

/**
 * Simulated outbound registry gate (no Graph API call).
 */
export async function simulateOutboundRegistryProbe({
    companyId,
    phoneNumberId,
    credentialsSource = "env",
    correlationId = null,
} = {}) {
    let blocked = false;
    let errorCode = null;
    try {
        await assertManagedOutboundRegistryAllowed({
            companyId,
            phoneNumberId,
            credentialsSource,
        });
    } catch (err) {
        blocked = true;
        errorCode = err.code || "OUTBOUND_BLOCKED";
    }
    const event = recordGatewayProbeEvent({
        kind: "outbound_registry_simulated",
        correlationId,
        companyId,
        phoneNumberIdSuffix: phoneNumberId ? String(phoneNumberId).slice(-4) : null,
        credentialsSource,
        success: !blocked,
        errorCode,
        live: false,
    });
    return {
        simulated: true,
        success: !blocked,
        errorCode,
        probeEventId: event.id,
    };
}

/** Placeholder for future live probe — always throws unless authorized. */
export async function executeLiveInboundProbe() {
    assertLiveProbeAllowed();
    throw new Error("Live inbound probe executor not implemented — requires approved recipient workflow");
}

export async function executeLiveOutboundProbe() {
    assertLiveProbeAllowed();
    throw new Error("Live outbound probe executor not implemented — requires approved recipient workflow");
}
