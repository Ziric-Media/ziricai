/**
 * Multi-vehicle test drive plan (appointment cart) — immutable CONFIRMED entries.
 */
import {
    customerDocId,
    conversationDocId,
    getOrCreateConversation,
    getTenantConversation,
    conversationsRepo,
} from "../storage/tenantStorage.js";
import {
    parseScheduledInput,
    formatSlotLabel,
    toBusinessDateString,
    findFirstAvailableSlotForVehicle,
    getDatePartsInBusinessTz,
} from "../tools/availability.js";
import { evaluateTestDriveAvailability } from "../tools/testDriveAvailability.js";
import { resolveVehicle, vehicleToPublic } from "../inventory/inventoryService.js";

/** @typedef {"CONFIRMED"|"PENDING"|"FAILED"} PlanEntryStatus */

/**
 * @typedef {object} TestDrivePlanEntry
 * @property {string} vehicleId
 * @property {string} [stockNumber]
 * @property {string} [title]
 * @property {string} [location]
 * @property {string} [date] YYYY-MM-DD business TZ
 * @property {string} [time] HH:mm
 * @property {string} [slotStart] ISO instant
 * @property {string} [slotLabel]
 * @property {PlanEntryStatus} status
 * @property {string} [appointmentId]
 * @property {string} [failureCode]
 * @property {string} [failureReason]
 * @property {string} [updatedAt]
 */

/**
 * @param {string} companyId
 * @param {string} phone
 * @param {string} [channel]
 * @returns {Promise<TestDrivePlanEntry[]>}
 */
export async function getTestDrivePlan(companyId, phone, channel = "whatsapp") {
    if (!companyId || !phone) return [];
    const conv = await getTenantConversation(companyId, phone, channel);
    const plan = conv?.meta?.testDrivePlan;
    return Array.isArray(plan) ? plan.map((e) => ({ ...e })) : [];
}

/**
 * @param {string} companyId
 * @param {string} phone
 * @param {string} [channel]
 * @param {TestDrivePlanEntry[]} plan
 */
export async function saveTestDrivePlan(companyId, phone, channel = "whatsapp", plan = []) {
    if (!companyId || !phone) return [];
    const conversationId = conversationDocId(customerDocId(phone), channel);
    await getOrCreateConversation(companyId, phone, channel);
    const existing = (await getTenantConversation(companyId, phone, channel)) || {};
    const prior = Array.isArray(existing.meta?.testDrivePlan) ? existing.meta.testDrivePlan : [];
    const merged = mergePlanEntries(prior, plan);

    await conversationsRepo.update(companyId, conversationId, {
        meta: { ...(existing.meta || {}), testDrivePlan: merged },
    });
    return merged;
}

/**
 * Never downgrade CONFIRMED entries.
 * @param {TestDrivePlanEntry[]} prior
 * @param {TestDrivePlanEntry[]} incoming
 */
export function mergePlanEntries(prior = [], incoming = []) {
    const byVehicle = new Map();
    for (const entry of prior) {
        if (entry?.vehicleId) byVehicle.set(entry.vehicleId, { ...entry });
    }
    for (const entry of incoming) {
        if (!entry?.vehicleId) continue;
        const existing = byVehicle.get(entry.vehicleId);
        if (existing?.status === "CONFIRMED" && entry.status !== "CONFIRMED") {
            byVehicle.set(entry.vehicleId, {
                ...existing,
                ...pickNonStatusFields(entry),
                status: "CONFIRMED",
                appointmentId: existing.appointmentId || entry.appointmentId,
            });
        } else {
            byVehicle.set(entry.vehicleId, { ...(existing || {}), ...entry });
        }
    }
    return [...byVehicle.values()];
}

function pickNonStatusFields(entry) {
    const { status, failureCode, failureReason, ...rest } = entry;
    return rest;
}

/**
 * @param {TestDrivePlanEntry[]} plan
 * @param {Partial<TestDrivePlanEntry>} patch
 */
export function upsertPlanEntry(plan = [], patch = {}) {
    if (!patch.vehicleId) return plan;
    const idx = plan.findIndex((e) => e.vehicleId === patch.vehicleId);
    const now = new Date().toISOString();
    const next = { updatedAt: now, ...patch };

    if (idx >= 0) {
        const existing = plan[idx];
        if (existing.status === "CONFIRMED" && next.status !== "CONFIRMED") {
            next.status = "CONFIRMED";
            next.appointmentId = existing.appointmentId || next.appointmentId;
            delete next.failureCode;
            delete next.failureReason;
        }
        const copy = [...plan];
        copy[idx] = { ...existing, ...next };
        return copy;
    }
    return [...plan, { status: "PENDING", ...next }];
}

/**
 * Build plan patch from a successful bookTestDrive result.
 * @param {object} args
 * @param {object} result
 * @returns {Partial<TestDrivePlanEntry>|null}
 */
export function confirmedEntryFromBooking(args = {}, result = {}) {
    const vehicleId = result.vehicleId || args.vehicleId || result.appointment?.vehicleId;
    if (!vehicleId || !result.ok) return null;

    const appt = result.appointment || result.booking;
    const scheduledAt = appt?.scheduledAt ? new Date(appt.scheduledAt) : null;
    let isoDate = null;
    let timeStr = null;
    if (scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
        const parts = getDatePartsInBusinessTz(scheduledAt);
        if (parts) {
            isoDate = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
            timeStr = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
        }
    }

    return {
        vehicleId,
        stockNumber: appt?.stockNumber || args.vehicleStockNumber || null,
        title: appt?.vehicleDescription || appt?.metadata?.vehicleLabel || null,
        location: appt?.location || appt?.metadata?.location || null,
        date: isoDate,
        time: timeStr,
        slotStart: scheduledAt ? scheduledAt.toISOString() : result.slotStart || null,
        slotLabel: scheduledAt ? formatSlotLabel(scheduledAt) : null,
        status: "CONFIRMED",
        appointmentId: appt?.id || null,
        failureCode: null,
        failureReason: null,
    };
}

/**
 * @param {object} args
 * @param {object} result
 * @returns {Partial<TestDrivePlanEntry>|null}
 */
export function failedEntryFromBooking(args = {}, result = {}) {
    const vehicleId = args.vehicleId || result.vehicle?.vehicleId;
    if (!vehicleId || result.ok) return null;

    return {
        vehicleId,
        stockNumber: args.vehicleStockNumber || result.vehicle?.stockNumber || null,
        title: result.vehicle?.title || null,
        location: result.vehicle?.location || null,
        status: "FAILED",
        failureCode: result.code || null,
        failureReason: result.error || result.reason || null,
    };
}

/**
 * @param {string} toolName
 * @param {object} args
 * @param {object} result
 * @param {TestDrivePlanEntry[]} [currentPlan]
 * @returns {TestDrivePlanEntry[]}
 */
export function planUpdatesFromToolResult(toolName, args = {}, result = {}, currentPlan = []) {
    if (toolName !== "bookTestDrive") return currentPlan;

    const vehicleId = args.vehicleId || result.vehicleId || result.vehicle?.vehicleId;
    if (!vehicleId) return currentPlan;

    if (result.ok) {
        const confirmed = confirmedEntryFromBooking(args, result);
        return confirmed ? upsertPlanEntry(currentPlan, confirmed) : currentPlan;
    }

    const existing = currentPlan.find((e) => e.vehicleId === vehicleId);
    if (existing?.status === "CONFIRMED") {
        return currentPlan;
    }

    const failed = failedEntryFromBooking(args, result);
    return failed ? upsertPlanEntry(currentPlan, failed) : currentPlan;
}

/**
 * Detect customer approval to finalize pending appointments.
 * @param {string} text
 */
export function isPlanConfirmationIntent(text) {
    const t = String(text || "").toLowerCase();
    if (/\b(?:happy|good|fine|great)\s+with\s+(?:this\s+)?plan\b/.test(t) && /\b(?:go\s+ahead|proceed|confirm|let'?s\s+do\s+it)\b/.test(t)) {
        return true;
    }
    if (/\blet'?s\s+go\s+ahead\b/.test(t) && /\b(?:plan|book|appointment|test\s+drive)\b/.test(t)) return true;
    if (/\b(?:confirm|finalize)\s+(?:all|both|everything|the\s+appointments?)\b/.test(t)) return true;
    if (/\bgo\s+ahead\s+with\s+(?:the\s+)?(?:plan|bookings?|appointments?)\b/.test(t)) return true;
    return false;
}

/**
 * @param {TestDrivePlanEntry[]} plan
 */
export function formatTestDrivePlanForPrompt(plan = []) {
    if (!plan.length) return "";

    const lines = ["TEST DRIVE PLAN (authoritative — preserve CONFIRMED entries; never undo successful bookings):"];
    for (const entry of plan) {
        const label = entry.title || entry.stockNumber || entry.vehicleId;
        const when = entry.slotLabel || (entry.date && entry.time ? `${entry.date} ${entry.time}` : entry.date || "time TBC");
        const branch = entry.location ? ` @ ${entry.location}` : "";
        lines.push(`- ${label} (${entry.stockNumber || entry.vehicleId}): ${when}${branch} — ${entry.status}`);
        if (entry.status === "CONFIRMED" && entry.appointmentId) {
            lines.push(`  • CONFIRMED booking id ${entry.appointmentId} — do NOT re-book or claim this failed.`);
        }
        if (entry.status === "FAILED" && entry.failureReason) {
            lines.push(`  • Slot issue: ${entry.failureReason} — vehicle may still be in inventory; offer another time.`);
        }
        if (entry.status === "PENDING") {
            lines.push(`  • PENDING — finalize when customer confirms the plan.`);
        }
    }

    const confirmed = plan.filter((e) => e.status === "CONFIRMED");
    const pending = plan.filter((e) => e.status === "PENDING");
    const failed = plan.filter((e) => e.status === "FAILED");

    if (confirmed.length && (pending.length || failed.length)) {
        lines.push(
            `- Partial success: ${confirmed.length} confirmed, ${pending.length} pending, ${failed.length} need another slot — acknowledge confirmed bookings before helping with the rest.`
        );
    }

    return lines.join("\n");
}

/**
 * Resolve scheduledAt using explicit date from scheduling context / offered slots.
 * @param {object} args
 * @param {object} scheduling
 */
export function resolveScheduledAtWithContext(args = {}, scheduling = {}) {
    const enriched = { ...args };
    const contextDate = scheduling.pendingDate || scheduling.lastMentionedDate || scheduling.lastOfferedDate;

    if (enriched.scheduledAt && isFullDateTimeString(enriched.scheduledAt) && !isTimeOnlyInput(enriched.scheduledAt)) {
        const instant = new Date(enriched.scheduledAt);
        if (!Number.isNaN(instant.getTime())) {
            return { ok: true, dateTime: instant, date: toBusinessDateString(instant) };
        }
    }

    if (contextDate && !enriched.date) {
        enriched.date = contextDate;
    }

    if (enriched.scheduledAt && contextDate && isTimeOnlyInput(enriched.scheduledAt)) {
        enriched.time = enriched.scheduledAt;
        delete enriched.scheduledAt;
    }

    const parsed = parseScheduledInput({
        date: enriched.date,
        time: enriched.time,
        scheduledAt: enriched.scheduledAt,
        contextDate,
    });

    if (!parsed.ok || !parsed.hasExplicitTime || !parsed.dateTime) {
        return { ok: false, error: parsed.error || "Could not resolve date and time." };
    }

    return { ok: true, dateTime: parsed.dateTime, date: toBusinessDateString(parsed.dateTime) };
}

function isTimeOnlyInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(raw)) return true;
    if (/^\d{1,2}:\d{2}$/.test(raw)) return true;
    if (isFullDateTimeString(raw)) return false;
    return hasExplicitTimeInStringSafe(raw) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{4}-\d{2}-\d{2})\b/i.test(raw);
}

function isFullDateTimeString(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return true;
    if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(raw)) return true;
    return /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
}

function hasExplicitTimeInStringSafe(value) {
    return /\d{1,2}:\d{2}/.test(value) || /\d{1,2}\s*(am|pm)\b/i.test(value);
}

/**
 * Match customer time selection to a previously offered slot.
 * @param {string} text
 * @param {Array<{ slotStart?: string, label?: string }>} offeredSlots
 * @param {string} [contextDate]
 */
export function matchOfferedSlot(text, offeredSlots = [], contextDate = null) {
    if (!offeredSlots.length) return null;
    const raw = String(text || "").trim().toLowerCase();
    if (!raw) return null;

    for (const slot of offeredSlots) {
        if (slot.label && raw === slot.label.toLowerCase()) return slot;
    }

    const timeMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const target = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    for (const slot of offeredSlots) {
        if (!slot.slotStart) continue;
        const parsed = parseScheduledInput({ scheduledAt: slot.slotStart });
        if (!parsed.ok || !parsed.dateTime) continue;
        const slotTime = `${String(parsed.dateTime.getHours()).padStart(2, "0")}:${String(parsed.dateTime.getMinutes()).padStart(2, "0")}`;
        if (slotTime === target) {
            if (contextDate) {
                const slotDate = toBusinessDateString(parsed.dateTime);
                if (slotDate !== contextDate) continue;
            }
            return slot;
        }
        if (slot.label && slot.label.toLowerCase().includes(target)) return slot;
    }

    return null;
}

/**
 * Auto-find next bookable slot for one vehicle after failure.
 * @param {string} companyId
 * @param {string} vehicleId
 * @param {object} [options]
 */
export async function findAlternativeSlotForVehicle(companyId, vehicleId, options = {}) {
    const fromSlot = options.fromSlot ? new Date(options.fromSlot) : null;

    if (fromSlot && !Number.isNaN(fromSlot.getTime())) {
        const { findNextStaggeredSlot } = await import("../tools/availability.js");
        const staggered = await findNextStaggeredSlot(companyId, fromSlot);
        if (staggered) {
            const check = await evaluateTestDriveAvailability(companyId, {
                vehicleId,
                scheduledAt: staggered.slotStart.toISOString(),
                includeAlternatives: false,
                customerId: options.customerId,
            });
            if (check.available) {
                return {
                    slotStart: check.slotStart,
                    slotLabel: check.slotLabel,
                    date: toBusinessDateString(new Date(check.slotStart)),
                };
            }
        }
    }

    const next = await findFirstAvailableSlotForVehicle(companyId, vehicleId, {
        daysAhead: options.daysAhead ?? 7,
        customerId: options.customerId,
        evaluate: evaluateTestDriveAvailability,
    });
    return next;
}

/**
 * Finalize all PENDING entries in the plan by booking them.
 * @param {object} ctx
 * @param {TestDrivePlanEntry[]} plan
 */
export async function finalizePendingPlanEntries(ctx, plan = []) {
    const pending = plan.filter((e) => e.status === "PENDING" && e.vehicleId);
    const results = [];

    for (const entry of pending) {
        const vehicle = await resolveVehicle(ctx.companyId, { vehicleId: entry.vehicleId });
        if (!vehicle) {
            results.push({
                vehicleId: entry.vehicleId,
                ok: false,
                code: "INVALID_VEHICLE",
                error: "Vehicle not found in inventory.",
            });
            continue;
        }

        let scheduledAt = entry.slotStart;
        if (!scheduledAt && entry.date && entry.time) {
            const parsed = parseScheduledInput({ date: entry.date, time: entry.time });
            if (parsed.ok && parsed.dateTime) scheduledAt = parsed.dateTime.toISOString();
        }

        if (!scheduledAt) {
            const alt = await findAlternativeSlotForVehicle(ctx.companyId, entry.vehicleId, {
                customerId: ctx.customerId,
            });
            if (alt) {
                scheduledAt = alt.slotStart;
            } else {
                results.push({
                    vehicleId: entry.vehicleId,
                    ok: false,
                    code: "NO_SLOTS",
                    error: "No available slot found for this vehicle.",
                    slotIssue: true,
                });
                continue;
            }
        }

        const { runTool } = await import("../tools/index.js");
        const bookResult = await runTool(
            "bookTestDrive",
            { ...ctx, testDrivePlan: plan },
            {
                vehicleId: entry.vehicleId,
                scheduledAt,
                customerName: ctx.customerName,
            }
        );

        results.push({ vehicleId: entry.vehicleId, ...bookResult });
        if (bookResult.ok) {
            const confirmed = confirmedEntryFromBooking({ vehicleId: entry.vehicleId }, bookResult);
            if (confirmed) {
                plan = upsertPlanEntry(plan, confirmed);
            }
        } else {
            plan = upsertPlanEntry(plan, {
                vehicleId: entry.vehicleId,
                status: "FAILED",
                failureCode: bookResult.code,
                failureReason: bookResult.error || bookResult.reason,
            });
        }
    }

    return { plan, results };
}

/**
 * Mark pending entries when availability confirms a slot but booking not yet done.
 * @param {TestDrivePlanEntry[]} plan
 * @param {object} args
 * @param {object} result
 */
export function pendingEntryFromAvailability(plan = [], args = {}, result = {}) {
    const vehicleId = args.vehicleId || result.vehicle?.vehicleId;
    if (!vehicleId || !result.available) return plan;

    const existing = plan.find((e) => e.vehicleId === vehicleId);
    if (existing?.status === "CONFIRMED") return plan;

    const patch = {
        vehicleId,
        stockNumber: result.vehicle?.stockNumber || args.vehicleStockNumber || null,
        title: result.vehicle?.title || null,
        location: result.vehicle?.location || null,
        date: result.date || null,
        slotStart: result.slotStart || null,
        slotLabel: result.slotLabel || null,
        status: "PENDING",
    };

    if (result.slotStart) {
        const parsed = parseScheduledInput({ scheduledAt: result.slotStart });
        if (parsed.ok && parsed.dateTime) {
            patch.date = toBusinessDateString(parsed.dateTime);
            patch.time = `${String(parsed.dateTime.getHours()).padStart(2, "0")}:${String(parsed.dateTime.getMinutes()).padStart(2, "0")}`;
        }
    }

    return upsertPlanEntry(plan, patch);
}

export { vehicleToPublic };
