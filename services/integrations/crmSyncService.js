/**
 * Phase 2A — Sarah ↔ CRM synchronization layer.
 * CRM is the system of record for customer and sales relationship data.
 * All writes are tenant-scoped and idempotent.
 */
import { normalizePhone, getCustomer, addTimelineEvent } from "../customerService.js";
import { upsertTenantCustomer } from "../storage/tenantStorage.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { publish, EventTypes } from "../events/index.js";
import {
    mapSarahStageToCrmStage,
    advanceCrmStage,
    leadScoreFromSarahStage,
    formatSarahStageLabel,
} from "./leadStageMapping.js";

const leadRepo = new TenantRepository(TENANT_COLLECTIONS.LEADS);

function now() {
    return new Date().toISOString();
}

function buildVehicleInterestLabel(salesContext = {}) {
    const preferred = salesContext.preferredVehicle || salesContext.selectedVehicle || null;
    if (preferred) return String(preferred);

    const top = salesContext.lastRecommendedVehicles?.[0];
    if (!top) return null;

    const parts = [top.year, top.make, top.model].filter(Boolean);
    if (parts.length) return parts.join(" ");
    return top.title || top.vehicleId || null;
}

function buildInterestsPatch(salesContext = {}) {
    if (!salesContext || !Object.keys(salesContext).length) return null;

    const vehicleInterest = buildVehicleInterestLabel(salesContext);
    const interests = {};

    if (vehicleInterest) interests.vehicleInterest = vehicleInterest;
    if (salesContext.budget != null) interests.budget = salesContext.budget;
    if (salesContext.bodyType) interests.bodyType = salesContext.bodyType;
    if (salesContext.familySize != null) interests.familySize = salesContext.familySize;
    if (salesContext.vehiclePreferences?.length) {
        interests.vehiclePreferences = salesContext.vehiclePreferences;
    }

    return Object.keys(interests).length ? interests : null;
}

function resolveLeadScore({ leadScore, salesContext }) {
    const pipelineScore = Number.isFinite(Number(leadScore)) ? Number(leadScore) : 0;
    const stageScore = leadScoreFromSarahStage(salesContext?.leadStage);
    return Math.max(pipelineScore, stageScore, 50);
}

function shouldCreateLead({ salesContext, leadScore }) {
    const stage = String(salesContext?.leadStage || "NEW").toUpperCase();
    if (stage !== "NEW") return true;
    if ((leadScore ?? 0) >= 60) return true;
    if (salesContext?.budget != null) return true;
    if (salesContext?.lastRecommendedVehicles?.length) return true;
    if (salesContext?.preferredVehicle || salesContext?.selectedVehicle) return true;
    return false;
}

/**
 * Idempotent tenant-scoped timeline write. Skips when an entry with the same id exists.
 */
export async function addTenantTimelineEventIfNew(companyId, phone, event) {
    if (!companyId || !phone || !event) return null;
    return addTimelineEvent(phone, event, { companyId, idempotent: true });
}

async function syncCustomerIdentity(companyId, phone, { contactName, channel, salesContext, aiEmployeeName }) {
    const key = normalizePhone(phone);
    const existing = (await getCustomer(key, { companyId })) || {};
    const interestsPatch = buildInterestsPatch(salesContext);
    const patch = {
        channel: channel || existing.channel || "whatsapp",
        status: existing.status || "in_progress",
    };

    if (aiEmployeeName) {
        patch.assignedAiEmployee = aiEmployeeName;
        patch.assignedEmployee = existing.assignedEmployee || aiEmployeeName;
    }

    if (interestsPatch) {
        patch.interests = { ...(existing.interests || {}), ...interestsPatch };
    }

    if (contactName && !existing.displayName && !existing.explicitName) {
        patch.name = contactName;
        patch.whatsappContactName = contactName;
    }

    return upsertTenantCustomer(companyId, key, patch);
}

async function syncLeadRecord(companyId, phone, options = {}) {
    const {
        contactName,
        channel,
        leadScore,
        topic,
        salesContext,
        aiEmployeeName,
    } = options;

    const id = normalizePhone(phone);
    const existing = await leadRepo.get(companyId, id);
    const sarahStage = salesContext?.leadStage || existing?.sarahLeadStage || null;
    const mappedStage = mapSarahStageToCrmStage(sarahStage) || existing?.stage || "new";
    const stage = advanceCrmStage(existing?.stage, mappedStage);
    const score = Math.max(existing?.leadScore || 0, resolveLeadScore({ leadScore, salesContext }));
    const vehicleInterest = buildVehicleInterestLabel(salesContext) || existing?.vehicleInterest || null;

    const patch = {
        phone: id,
        name: contactName || existing?.name || id,
        leadScore: score,
        stage,
        source: channel || existing?.source || "whatsapp",
        topic: topic || existing?.topic || null,
        sarahLeadStage: sarahStage || existing?.sarahLeadStage || null,
        vehicleInterest,
        budget: salesContext?.budget ?? existing?.budget ?? null,
        assignedAiEmployee: aiEmployeeName || existing?.assignedAiEmployee || "Sarah",
        lastActivityAt: now(),
        companyId,
    };

    if (existing) {
        return leadRepo.update(companyId, id, patch);
    }

    if (!shouldCreateLead({ salesContext, leadScore: score })) {
        return null;
    }

    const lead = await leadRepo.create(companyId, { id, ...patch, createdAt: now() }, id);
    await publish(companyId, EventTypes.LEAD_CAPTURED, {
        leadId: lead.id,
        phone: id,
        contactName: patch.name,
        leadScore: score,
        topic: patch.topic,
        channel: patch.source,
        source: "sarah_crm_sync",
    });
    return lead;
}

async function syncSarahStageTimeline(companyId, phone, salesContext) {
    const sarahStage = salesContext?.leadStage;
    if (!sarahStage) return null;

    return addTenantTimelineEventIfNew(companyId, phone, {
        id: `sarah-stage-${String(sarahStage).toUpperCase()}`,
        type: "sales_stage",
        title: `Sales stage: ${formatSarahStageLabel(sarahStage)}`,
        description: `Sarah updated lead stage to ${formatSarahStageLabel(sarahStage)}.`,
        meta: {
            sarahLeadStage: sarahStage,
            crmStage: mapSarahStageToCrmStage(sarahStage),
            source: "sarah",
        },
    });
}

async function syncVehicleInterestTimeline(companyId, phone, salesContext) {
    const top = salesContext?.lastRecommendedVehicles?.[0];
    if (!top?.vehicleId) return null;

    const label = buildVehicleInterestLabel(salesContext) || top.vehicleId;
    return addTenantTimelineEventIfNew(companyId, phone, {
        id: `sarah-vehicle-${top.vehicleId}`,
        type: "vehicle_interest",
        title: "Vehicle recommended",
        description: `Sarah recommended ${label}.`,
        meta: {
            vehicleId: top.vehicleId,
            stockNumber: top.stockNumber || null,
            source: "sarah",
        },
    });
}

/**
 * Synchronize Sarah turn data into tenant CRM records.
 * Safe to call multiple times for the same turn/event.
 */
export async function syncFromSalesTurn(companyId, phone, options = {}) {
    if (!companyId || !phone) return null;

    const key = normalizePhone(phone);
    const {
        contactName,
        channel = "whatsapp",
        leadScore,
        topic,
        salesContext,
        aiEmployeeId,
        aiEmployeeName = "Sarah",
    } = options;

    await syncCustomerIdentity(companyId, key, {
        contactName,
        channel,
        salesContext,
        aiEmployeeName,
    });

    const lead = await syncLeadRecord(companyId, key, {
        contactName,
        channel,
        leadScore,
        topic,
        salesContext,
        aiEmployeeName,
    });

    if (salesContext) {
        await syncSarahStageTimeline(companyId, key, salesContext);
        await syncVehicleInterestTimeline(companyId, key, salesContext);
    }

    return {
        companyId,
        phone: key,
        lead,
        aiEmployeeId: aiEmployeeId || null,
    };
}

/**
 * Record a successful test-drive booking in tenant CRM (idempotent).
 */
export async function syncTestDriveBooked(companyId, phone, { appointment, vehicleLabel, duplicate = false } = {}) {
    if (!companyId || !phone || !appointment?.id) return null;
    if (duplicate) {
        return { skipped: true, reason: "duplicate_booking" };
    }

    const key = normalizePhone(phone);
    const existingLead = await leadRepo.get(companyId, key);
    const stage = advanceCrmStage(existingLead?.stage, mapSarahStageToCrmStage("TEST_DRIVE_BOOKED"));

    if (existingLead) {
        await leadRepo.update(companyId, key, {
            stage,
            sarahLeadStage: "TEST_DRIVE_BOOKED",
            lastActivityAt: now(),
            vehicleInterest: vehicleLabel || existingLead.vehicleInterest || null,
        });
    } else {
        await leadRepo.create(
            companyId,
            {
                id: key,
                phone: key,
                name: key,
                stage,
                sarahLeadStage: "TEST_DRIVE_BOOKED",
                leadScore: leadScoreFromSarahStage("TEST_DRIVE_BOOKED"),
                source: "whatsapp",
                vehicleInterest: vehicleLabel || null,
                assignedAiEmployee: "Sarah",
                lastActivityAt: now(),
                createdAt: now(),
                companyId,
            },
            key
        );
    }

    const scheduledLabel = appointment.scheduledAt
        ? new Date(appointment.scheduledAt).toLocaleString("en-ZA", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "scheduled time";

    await addTenantTimelineEventIfNew(companyId, key, {
        id: `appointment-${appointment.id}`,
        type: "appointment",
        title: "Test drive booked",
        description: `${vehicleLabel || "Vehicle"} — ${scheduledLabel}`,
        meta: {
            appointmentId: appointment.id,
            vehicleId: appointment.vehicleId || appointment.metadata?.vehicleId || null,
            stockNumber: appointment.vehicleStockNumber || null,
            source: "sarah",
        },
    });

    return { companyId, phone: key, appointmentId: appointment.id, stage };
}
