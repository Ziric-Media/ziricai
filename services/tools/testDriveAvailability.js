/**
 * Core test-drive availability evaluation — separates inventory, slot, and scheduling checks.
 */
import {
    resolveVehicle,
    isVehicleAvailable,
    searchInventory,
    listAlternatives,
    vehicleToPublic,
} from "../inventory/inventoryService.js";
import {
    parseScheduledInput,
    isWithinBusinessHours,
    normalizeToSlotStart,
    checkSlotCapacity,
    findOpenSlotsForDate,
    formatSlotLabel,
    getBusinessHours,
    findNextStaggeredSlot,
    findFirstAvailableSlotForVehicle,
    slotEnd,
    toBusinessDateString,
} from "./availability.js";
import { listAppointmentsByCustomer } from "../database/appointmentRepository.js";

/** Map legacy codes for backward compatibility in older verify scripts */
export const LEGACY_AVAILABILITY_CODES = {
    INVENTORY_UNAVAILABLE: "VEHICLE_NOT_IN_INVENTORY",
    SLOT_FULL: "SLOT_UNAVAILABLE",
    OUTSIDE_HOURS: "OUTSIDE_BUSINESS_HOURS",
};

/**
 * @param {string} companyId
 * @param {object} options
 * @param {string} [options.vehicleId]
 * @param {string} [options.stockNumber]
 * @param {string} [options.date]
 * @param {string} [options.time]
 * @param {string} [options.scheduledAt]
 * @param {string} [options.query]
 * @param {string} [options.make]
 * @param {string} [options.model]
 * @param {boolean} [options.includeAlternatives]
 * @param {string} [options.customerId]
 * @param {boolean} [options.autoSelectNext]
 */
export async function evaluateTestDriveAvailability(companyId, options = {}) {
    const includeAlternatives = options.includeAlternatives !== false;
    const hasVehicleRef = Boolean(options.vehicleId || options.stockNumber);

    if (!hasVehicleRef && (options.query || options.make || options.model)) {
        return findVehiclesWithTestDriveAvailability(companyId, options);
    }

    if (!hasVehicleRef) {
        return {
            available: false,
            code: "MISSING_VEHICLE",
            reason: "Specify vehicleId/stockNumber or a search query (make/model) to find vehicles.",
            alternatives: { vehicles: [], slots: [] },
        };
    }

    const vehicle = await resolveVehicle(companyId, {
        vehicleId: options.vehicleId,
        stockNumber: options.stockNumber,
    });

    if (!vehicle) {
        return {
            available: false,
            code: "INVALID_VEHICLE",
            reason: "Vehicle was not found in this company's inventory.",
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!isVehicleAvailable(vehicle)) {
        const altVehicles = includeAlternatives
            ? await listAlternativesWithSlots(companyId, {
                  make: vehicle.make,
                  model: vehicle.model,
                  excludeVehicleId: vehicle.vehicleId,
                  date: options.date,
                  time: options.time,
                  scheduledAt: options.scheduledAt,
              })
            : [];
        const label =
            vehicle.title || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "That vehicle";
        const stockRef = vehicle.stockNumber ? `, stock ${vehicle.stockNumber}` : "";
        return {
            available: false,
            code: "VEHICLE_NOT_IN_INVENTORY",
            reason: `The ${label}${stockRef}, is no longer available in inventory.`,
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: altVehicles, slots: [] },
        };
    }

    if (options.autoSelectNext) {
        const nextSlot = await findFirstAvailableSlotForVehicle(companyId, vehicle.vehicleId, {
            daysAhead: 7,
            customerId: options.customerId,
            evaluate: evaluateTestDriveAvailability,
        });
        if (nextSlot) {
            return {
                available: true,
                code: "AUTO_SELECT",
                reason: `Earliest available slot: ${nextSlot.slotLabel}.`,
                autoSelected: true,
                vehicle: vehicleToPublic(vehicle),
                slotStart: nextSlot.slotStart,
                slotLabel: nextSlot.slotLabel,
                date: nextSlot.date,
                suggestedSlots: [{ slotStart: nextSlot.slotStart, label: nextSlot.slotLabel }],
                alternatives: { vehicles: [], slots: [{ slotStart: nextSlot.slotStart, label: nextSlot.slotLabel }] },
            };
        }
        return {
            available: false,
            code: "NO_SLOTS",
            reason: "No test-drive slots available in the next 7 days for this vehicle.",
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: [], slots: [] },
        };
    }

    const parsed = parseScheduledInput({
        date: options.date,
        time: options.time,
        scheduledAt: options.scheduledAt,
    });

    if (!parsed.ok) {
        return {
            available: false,
            code: "INVALID_DATETIME",
            reason: parsed.error,
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!parsed.hasExplicitTime && !parsed.dateOnly && !options.date && !options.scheduledAt) {
        return {
            available: false,
            code: "NEED_DATE",
            reason: "Ask the customer which date they would like for the test drive.",
            needsDate: true,
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!parsed.hasExplicitTime) {
        const dateBase = parsed.dateOnly || parsed.dateTime;
        const slots = await findOpenSlotsForDate(companyId, dateBase);
        return {
            available: false,
            code: "NEED_TIME",
            reason: "Date noted — ask the customer for their preferred time before booking.",
            needsTime: true,
            vehicle: vehicleToPublic(vehicle),
            date: toBusinessDateString(dateBase),
            suggestedSlots: slots.slice(0, 8),
            alternatives: { vehicles: [], slots: slots.slice(0, 8) },
        };
    }

    const scheduledAt = parsed.dateTime;
    if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) {
        return {
            available: false,
            code: "PAST_SLOT",
            reason: "That time is in the past.",
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!isWithinBusinessHours(scheduledAt)) {
        const daySlots = await findOpenSlotsForDate(companyId, scheduledAt);
        return {
            available: false,
            code: "OUTSIDE_BUSINESS_HOURS",
            reason: "That time is outside business hours (Mon–Fri, 9:00–17:00 SAST).",
            vehicle: vehicleToPublic(vehicle),
            alternatives: { vehicles: [], slots: daySlots.slice(0, 8) },
        };
    }

    const slotStart = normalizeToSlotStart(scheduledAt);
    const capacity = await checkSlotCapacity(companyId, slotStart);

    if (!capacity.available) {
        const daySlots = await findOpenSlotsForDate(companyId, slotStart);
        const altVehicles = includeAlternatives
            ? await listAlternativesWithSlots(companyId, {
                  make: vehicle.make,
                  model: vehicle.model,
                  excludeVehicleId: vehicle.vehicleId,
                  date: options.date,
                  time: options.time,
                  scheduledAt: options.scheduledAt,
              })
            : [];
        return {
            available: false,
            code: "SLOT_UNAVAILABLE",
            reason: `That test-drive time is fully booked (${capacity.concurrent}/${capacity.max}). The vehicle is still in inventory — choose another time.`,
            vehicle: vehicleToPublic(vehicle),
            slotStart: slotStart.toISOString(),
            alternatives: {
                vehicles: altVehicles,
                slots: daySlots.filter((s) => s.slotStart !== slotStart.toISOString()).slice(0, 8),
            },
        };
    }

    if (options.customerId) {
        const customerConflict = await checkCustomerSlotConflict(
            companyId,
            options.customerId,
            slotStart,
            vehicle.vehicleId
        );
        if (customerConflict) {
            const staggered = await findNextStaggeredSlot(companyId, slotStart);
            return {
                available: false,
                code: "CUSTOMER_SLOT_CONFLICT",
                reason: customerConflict.reason,
                vehicle: vehicleToPublic(vehicle),
                slotStart: slotStart.toISOString(),
                conflictingBooking: customerConflict.booking,
                suggestedSlots: staggered
                    ? [{ slotStart: staggered.slotStart.toISOString(), label: staggered.label }]
                    : [],
                alternatives: {
                    vehicles: [],
                    slots: staggered
                        ? [{ slotStart: staggered.slotStart.toISOString(), label: staggered.label }]
                        : [],
                },
            };
        }
    }

    return {
        available: true,
        code: "AVAILABLE",
        reason: "Test drive slot is available.",
        vehicle: vehicleToPublic(vehicle),
        slotStart: slotStart.toISOString(),
        slotLabel: formatSlotLabel(slotStart),
        alternatives: { vehicles: [], slots: [] },
    };
}

async function listAlternativesWithSlots(companyId, { make, model, excludeVehicleId, date, time, scheduledAt }) {
    const candidates = await listAlternatives(companyId, { make, model, excludeVehicleId, limit: 10 });
    const withSlots = [];

    for (const candidate of candidates) {
        const check = await evaluateTestDriveAvailability(companyId, {
            vehicleId: candidate.vehicleId,
            date,
            time,
            scheduledAt,
            includeAlternatives: false,
        });
        if (check.available) {
            withSlots.push({
                ...candidate,
                slotStart: check.slotStart,
                slotLabel: check.slotLabel,
            });
        }
    }

    return withSlots.slice(0, 5);
}

async function findVehiclesWithTestDriveAvailability(companyId, options) {
    const parsed = parseScheduledInput({
        date: options.date,
        time: options.time,
        scheduledAt: options.scheduledAt,
    });

    if (!parsed.ok) {
        return {
            available: false,
            code: "INVALID_DATETIME",
            reason: parsed.error,
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!parsed.hasExplicitTime && !parsed.dateOnly && !options.date && !options.scheduledAt) {
        return {
            available: false,
            code: "NEED_DATE",
            reason: "Ask the customer which date they would like for the test drive.",
            needsDate: true,
            alternatives: { vehicles: [], slots: [] },
        };
    }

    const vehicles = await searchInventory(companyId, options.query || "", {
        make: options.make,
        model: options.model,
        availabilityOnly: true,
        limit: 20,
    });

    if (!vehicles.length) {
        return {
            available: false,
            code: "NO_VEHICLES",
            reason: "No matching vehicles in inventory.",
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (options.autoSelectNext) {
        for (const v of vehicles) {
            const nextSlot = await findFirstAvailableSlotForVehicle(companyId, v.vehicleId, {
                daysAhead: 7,
                customerId: options.customerId,
                evaluate: evaluateTestDriveAvailability,
            });
            if (nextSlot) {
                return {
                    available: true,
                    code: "AUTO_SELECT",
                    reason: `Earliest available: ${nextSlot.slotLabel} for ${v.title || v.make}.`,
                    autoSelected: true,
                    vehicle: v,
                    slotStart: nextSlot.slotStart,
                    slotLabel: nextSlot.slotLabel,
                    date: nextSlot.date,
                    suggestedSlots: [{ slotStart: nextSlot.slotStart, label: nextSlot.slotLabel }],
                    alternatives: { vehicles: [v], slots: [{ slotStart: nextSlot.slotStart, label: nextSlot.slotLabel }] },
                };
            }
        }
        return {
            available: false,
            code: "NO_SLOTS",
            reason: "No test-drive slots available in the next 7 days for matching vehicles.",
            alternatives: { vehicles: [], slots: [] },
        };
    }

    if (!parsed.hasExplicitTime) {
        const dateBase = parsed.dateOnly || parsed.dateTime;
        const daySlots = await findOpenSlotsForDate(companyId, dateBase);
        const availableVehicles =
            daySlots.length > 0
                ? vehicles.map((v) => ({
                      ...v,
                      openSlotCount: daySlots.length,
                      sampleSlots: daySlots.slice(0, 3),
                  }))
                : [];

        return {
            available: availableVehicles.length > 0,
            code: availableVehicles.length > 0 ? "NEED_TIME" : "NO_SLOTS",
            reason:
                availableVehicles.length > 0
                    ? `Found ${availableVehicles.length} vehicle(s) with open slots on that date — ask the customer for a preferred time.`
                    : "No test-drive slots available on that date.",
            needsTime: true,
            date: toBusinessDateString(dateBase),
            vehicles: availableVehicles,
            suggestedSlots: daySlots.slice(0, 8),
            alternatives: { vehicles: availableVehicles, slots: daySlots.slice(0, 8) },
        };
    }

    const availableVehicles = [];
    for (const v of vehicles) {
        const check = await evaluateTestDriveAvailability(companyId, {
            vehicleId: v.vehicleId,
            date: options.date,
            time: options.time,
            scheduledAt: options.scheduledAt,
            includeAlternatives: false,
        });
        if (check.available) {
            availableVehicles.push({
                ...v,
                slotStart: check.slotStart,
                slotLabel: check.slotLabel,
            });
        }
    }

    return {
        available: availableVehicles.length > 0,
        code: availableVehicles.length > 0 ? "AVAILABLE" : "NO_SLOTS",
        reason:
            availableVehicles.length > 0
                ? `${availableVehicles.length} vehicle(s) available for test drive at that time.`
                : "No vehicles have an open test-drive slot at that time.",
        vehicles: availableVehicles,
        alternatives: { vehicles: availableVehicles, slots: [] },
    };
}

export { getBusinessHours };

async function checkCustomerSlotConflict(companyId, customerId, slotStart, vehicleId) {
    const upcoming = await listAppointmentsByCustomer({
        companyId,
        customerId,
        appointmentType: "test_drive",
        statusFilter: "upcoming",
        limit: 20,
    });

    const startMs = slotStart.getTime();
    const endMs = slotEnd(slotStart).getTime();

    for (const booking of upcoming) {
        const bookingStart = normalizeToSlotStart(new Date(booking.scheduledAt));
        const bookingEnd = slotEnd(bookingStart);
        const overlaps =
            bookingStart.getTime() < endMs &&
            bookingEnd.getTime() > startMs &&
            booking.vehicleId !== vehicleId;

        if (overlaps) {
            return {
                booking,
                reason: `Customer already has a test drive at ${formatSlotLabel(bookingStart)} (${booking.vehicleDescription || "another vehicle"}). Book this vehicle at a staggered time (e.g. ${formatSlotLabel(new Date(startMs + 30 * 60 * 1000))}).`,
            };
        }
    }

    return null;
}
