/**
 * Inbound Sales channels → BOS commercial cycle (quotation consent on WhatsApp, etc.).
 */
import { resolveBosCompanyId, isBosPilotTenant } from "./bosPilot.js";
import {
    createCommercialCycle,
    findOpenCommercialCycleForCustomer,
    getCommercialCycle,
} from "./commercialCycleService.js";
import { SARAH_ROLES } from "./commercialCycleModel.js";
import { publish, EventTypes } from "../events/index.js";

function buildCycleTitle({ salesContext, inboundText }) {
    const vehicle =
        salesContext?.preferredVehicle ||
        salesContext?.requestedVehicle ||
        salesContext?.lastRecommendedVehicles?.[0]?.title ||
        salesContext?.lastRecommendedVehicles?.[0]?.vehicleId;
    if (vehicle) return `Quotation — ${String(vehicle).slice(0, 120)}`;
    const snippet = String(inboundText || "").trim().replace(/\s+/g, " ").slice(0, 100);
    if (snippet) return `Quotation — ${snippet}`;
    return "Customer quotation request";
}

const INBOUND_ACTOR = { role: "owner", uid: null };

/**
 * Open or reuse a commercial cycle when the customer consents to a quotation on a sales channel.
 *
 * @param {{
 *   companyId: string,
 *   customerPhone: string,
 *   customerName?: string,
 *   conversationId?: string|null,
 *   channel?: string,
 *   salesContext?: object|null,
 *   inboundText?: string,
 *   consentKind?: string,
 *   leadId?: string|null,
 * }} params
 */
export async function maybeOpenCommercialCycleFromInbound(params) {
    const portalCompanyId = params.companyId;
    if (!portalCompanyId || !isBosPilotTenant(portalCompanyId)) {
        return { skipped: true, reason: "not_pilot" };
    }

    const dataCompanyId = resolveBosCompanyId(portalCompanyId);
    const phone = params.customerPhone;
    if (!phone) return { skipped: true, reason: "no_phone" };

    const existingId = params.salesContext?.bosCommercialCycleId;
    if (existingId) {
        const linked = await getCommercialCycle(dataCompanyId, existingId);
        if (linked && !["completed", "exception"].includes(String(linked.stage || ""))) {
            return { skipped: true, reason: "already_linked", cycleId: existingId, cycle: linked };
        }
    }

    const open = await findOpenCommercialCycleForCustomer(dataCompanyId, phone);
    if (open) {
        return { skipped: true, reason: "open_cycle_exists", cycleId: open.id, cycle: open };
    }

    const customerName = String(params.customerName || "Customer").trim() || "Customer";
    const title = buildCycleTitle({
        salesContext: params.salesContext,
        inboundText: params.inboundText,
    });

    const cycle = await createCommercialCycle(dataCompanyId, INBOUND_ACTOR, {
        customerName,
        customerPhone: phone,
        title,
        leadId: params.leadId || null,
        conversationId: params.conversationId || null,
        sourceChannel: params.channel || "whatsapp",
        inboundConsentKind: params.consentKind || "unknown",
    });

    await publish(dataCompanyId, EventTypes.LEAD_CAPTURED, {
        source: "inbound_quotation_consent",
        cycleId: cycle.id,
        phone,
        channel: params.channel || "whatsapp",
        conversationId: params.conversationId || null,
    }).catch(() => {});

    return {
        opened: true,
        cycleId: cycle.id,
        cycle,
        dataCompanyId,
        actorRole: SARAH_ROLES.SALES,
    };
}
