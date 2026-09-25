/**
 * Authoritative appointment schedule operations — Postgres is source of truth.
 * Reschedule: BOOK NEW → verify success → CANCEL OLD.
 */
import { listAppointmentsByCustomer } from "../database/appointmentRepository.js";
import {
    toBusinessDateString,
    toBusinessTimeString,
    formatSlotLabel,
    parseScheduledAt,
} from "../tools/availability.js";
import bookTestDrive from "../tools/bookTestDrive.js";
import cancelTestDrive from "../tools/cancelTestDrive.js";

/** @param {Date|string} scheduledAt */
export function slotKey(scheduledAt) {
    const d = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return "";
    return `${toBusinessDateString(d)}T${toBusinessTimeString(d)}`;
}

/**
 * @param {object} booking
 * @param {{ date?: string, time?: string, vehicleId?: string }} target
 */
export function bookingMatchesSlot(booking, { date, time, vehicleId } = {}) {
    if (!booking?.scheduledAt) return false;
    if (vehicleId && booking.vehicleId !== vehicleId) return false;
    const bDate = toBusinessDateString(booking.scheduledAt);
    const bTime = toBusinessTimeString(booking.scheduledAt);
    if (date && bDate !== date) return false;
    if (time && bTime !== time) return false;
    return true;
}

/**
 * @param {object[]} bookings
 * @param {string} vehicleId
 */
export function findUpcomingBookingForVehicle(bookings, vehicleId) {
    const now = Date.now();
    return (
        bookings.find(
            (b) =>
                b.status !== "cancelled" &&
                b.vehicleId === vehicleId &&
                new Date(b.scheduledAt).getTime() >= now - 60000
        ) || null
    );
}

/**
 * @param {object} ctx
 */
export async function fetchAuthoritativeUpcoming(ctx) {
    if (!ctx?.companyId || !ctx?.customerId) return [];
    return listAppointmentsByCustomer({
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        statusFilter: "upcoming",
        limit: 50,
    });
}

/**
 * Reschedule one test drive: book new slot first, cancel old only after success.
 * @param {object} ctx
 * @param {{ vehicleId: string, scheduledAt: string, cancelBookingId?: string }} params
 */
export async function rescheduleTestDriveBooking(ctx, { vehicleId, scheduledAt, cancelBookingId } = {}) {
    if (!ctx?.companyId || !ctx?.customerId) {
        return { ok: false, code: "MISSING_CONTEXT", error: "companyId and customerId are required." };
    }
    if (!vehicleId) {
        return { ok: false, code: "INVALID_INPUT", error: "vehicleId is required." };
    }

    let targetDate;
    try {
        targetDate = parseScheduledAt(scheduledAt);
    } catch (err) {
        return { ok: false, code: "INVALID_DATETIME", error: err.message };
    }

    const upcoming = await fetchAuthoritativeUpcoming(ctx);
    const targetKey = slotKey(targetDate);

    const alreadyAtSlot = upcoming.find(
        (b) => b.vehicleId === vehicleId && slotKey(b.scheduledAt) === targetKey && b.status !== "cancelled"
    );
    if (alreadyAtSlot) {
        return {
            ok: true,
            tool: "rescheduleTestDrive",
            code: "ALREADY_SCHEDULED",
            duplicate: true,
            appointment: alreadyAtSlot,
            booking: alreadyAtSlot,
            message: `${alreadyAtSlot.vehicleDescription || "Vehicle"} is already scheduled for ${formatSlotLabel(new Date(alreadyAtSlot.scheduledAt))}.`,
            verifiedUpcoming: upcoming,
        };
    }

    const bookResult = await bookTestDrive.execute(ctx, { vehicleId, scheduledAt, customerName: ctx.customerName });
    if (!bookResult.ok) {
        return {
            ok: false,
            tool: "rescheduleTestDrive",
            code: "RESCHEDULE_BOOK_FAILED",
            error: bookResult.error || "Could not book the new slot.",
            bookResult,
        };
    }

    const newBookingId = bookResult.appointment?.id || bookResult.booking?.id;
    let cancelResult = null;

    if (cancelBookingId && cancelBookingId !== newBookingId) {
        cancelResult = await cancelTestDrive.execute(ctx, { bookingId: cancelBookingId });
        if (!cancelResult.ok) {
            const verified = await fetchAuthoritativeUpcoming(ctx);
            return {
                ok: false,
                tool: "rescheduleTestDrive",
                code: "RESCHEDULE_CANCEL_FAILED",
                partial: true,
                newBooking: bookResult.appointment || bookResult.booking,
                cancelResult,
                verifiedUpcoming: verified,
                message:
                    `Your new test drive is booked for ${formatSlotLabel(targetDate)}, but I could not cancel the previous booking yet. ` +
                    `Please contact us if you still see the old appointment.`,
            };
        }
    }

    const verifiedUpcoming = await fetchAuthoritativeUpcoming(ctx);
    const appt = bookResult.appointment || bookResult.booking;
    return {
        ok: true,
        tool: "rescheduleTestDrive",
        code: "RESCHEDULE_SUCCESS",
        appointment: appt,
        booking: appt,
        cancelledBookingId: cancelResult ? cancelBookingId : null,
        verifiedUpcoming,
        message: cancelBookingId
            ? `Rescheduled to ${formatSlotLabel(targetDate)} — ${appt?.vehicleDescription || "vehicle"}.`
            : bookResult.message,
    };
}

const FULL_SUCCESS_PHRASES = [
    /\bsuccessfully scheduled\b/i,
    /\btest drives have been\b/i,
    /\bare all set\b/i,
    /\ball set!\b/i,
    /\bconfirmed appointments\b/i,
    /\byour test drives are all set\b/i,
];

/** @param {string} reply */
export function replyClaimsFullBookingSuccess(reply) {
    return FULL_SUCCESS_PHRASES.some((pattern) => pattern.test(String(reply || "")));
}

/** @param {object[]} toolResults */
export function analyzeBookingToolResults(toolResults = []) {
    const books = toolResults.filter(
        (r) => r.tool === "bookTestDrive" || r.tool === "rescheduleTestDrive"
    );
    const cancels = toolResults.filter((r) => r.tool === "cancelTestDrive");
    const successCodes = new Set(["BOOKING_SUCCESS", "RESCHEDULE_SUCCESS", "ALREADY_SCHEDULED"]);

    return {
        bookAttempts: books.length,
        bookSuccesses: books.filter((r) => r.ok && successCodes.has(r.code)).length,
        bookFailures: books.filter((r) => !r.ok).length,
        cancelAttempts: cancels.length,
        cancelSuccesses: cancels.filter((r) => r.ok).length,
        hadBookingActivity: books.length + cancels.length > 0,
    };
}

/**
 * @param {object[]} upcoming
 * @param {string} [datePrefix] YYYY-MM-DD
 */
export function formatVerifiedUpcomingReply(upcoming, { datePrefix, intro } = {}) {
    let rows = upcoming.filter((b) => b.status !== "cancelled");
    if (datePrefix) {
        rows = rows.filter((b) => toBusinessDateString(b.scheduledAt) === datePrefix);
    }
    rows.sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    const lines = [intro || "Here are your confirmed upcoming test drives from our booking system:"];
    if (!rows.length) {
        lines.push("No confirmed upcoming test drives are saved yet.");
        return lines.join("\n");
    }

    for (const b of rows) {
        lines.push(
            `• ${b.vehicleDescription || "Vehicle"} — ${formatSlotLabel(new Date(b.scheduledAt))}` +
                (b.location ? ` (${b.location})` : "")
        );
    }
    return lines.join("\n");
}

/**
 * Build honest reply when tools failed but LLM claimed success.
 * @param {object[]} upcoming
 * @param {object[]} toolResults
 */
export function buildPartialBookingReply(upcoming, toolResults, analysis) {
    const failed = toolResults.filter(
        (r) =>
            (r.tool === "bookTestDrive" || r.tool === "rescheduleTestDrive") &&
            !r.ok
    );
    const lines = [
        "I wasn't able to complete every booking change in our system.",
    ];
    if (failed.length) {
        lines.push("", "Issues:");
        for (const f of failed) {
            lines.push(`• ${f.error || f.code || "Booking failed"}`);
        }
    }
    if (analysis.bookSuccesses > 0) {
        lines.push("", "These appointments are confirmed in our system:");
        const confirmed = upcoming.filter((b) => b.status !== "cancelled");
        if (!confirmed.length) {
            lines.push("• None saved yet — please tell me which slot to retry.");
        } else {
            for (const b of confirmed.slice(0, 5)) {
                lines.push(
                    `• ${b.vehicleDescription || "Vehicle"} — ${formatSlotLabel(new Date(b.scheduledAt))}`
                );
            }
        }
    }
    lines.push("", "Tell me which vehicle you'd like me to try again.");
    return lines.join("\n");
}

/**
 * Detect when reply mentions vehicles on a date that Postgres does not support.
 * @param {string} reply
 * @param {object[]} upcoming
 */
export function detectReplyScheduleMismatches(reply, upcoming) {
    const mismatches = [];
    const raw = String(reply || "");
    const dateMatch = raw.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i);
    let targetDate = null;
    if (dateMatch) {
        const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
        const monthKey = dateMatch[2].slice(0, 3).toLowerCase();
        targetDate = `${dateMatch[3]}-${months[monthKey] || "01"}-${String(dateMatch[1]).padStart(2, "0")}`;
    }

    const vehiclePatterns = [
        { label: "Everest", pattern: /\beverest\b/i },
        { label: "Changan", pattern: /\bchangan\b/i },
        { label: "Ciaz", pattern: /\bciaz\b/i },
        { label: "Amaze", pattern: /\bamaze\b/i },
    ];

    for (const { label, pattern } of vehiclePatterns) {
        if (!pattern.test(raw)) continue;
        const onDate = targetDate
            ? upcoming.filter(
                  (b) =>
                      b.status !== "cancelled" &&
                      toBusinessDateString(b.scheduledAt) === targetDate &&
                      pattern.test(b.vehicleDescription || "")
              )
            : upcoming.filter(
                  (b) => b.status !== "cancelled" && pattern.test(b.vehicleDescription || "")
              );
        if (!onDate.length) {
            mismatches.push({ vehicle: label, date: targetDate || "upcoming" });
        }
    }

    return mismatches;
}

/**
 * Prevent LLM from claiming full success when Postgres/tool results disagree.
 * @param {{ reply: string, toolResults?: object[], ctx: object }} params
 */
export async function guardBookingConfirmationReply({ reply, toolResults = [], ctx }) {
    const analysis = analyzeBookingToolResults(toolResults);
    const claimsSuccess = replyClaimsFullBookingSuccess(reply);

    if (!claimsSuccess && !analysis.hadBookingActivity) {
        return { reply, overridden: false };
    }

    const upcoming = await fetchAuthoritativeUpcoming(ctx);

    if (claimsSuccess && analysis.bookFailures > 0) {
        return {
            reply: buildPartialBookingReply(upcoming, toolResults, analysis),
            overridden: true,
            reason: "book_failure_with_success_claim",
        };
    }

    if (claimsSuccess && analysis.bookAttempts > 0 && analysis.bookSuccesses === 0) {
        return {
            reply: buildPartialBookingReply(upcoming, toolResults, analysis),
            overridden: true,
            reason: "no_successful_book_with_success_claim",
        };
    }

    const mismatches = detectReplyScheduleMismatches(reply, upcoming);
    if (claimsSuccess && mismatches.length) {
        return {
            reply: formatVerifiedUpcomingReply(upcoming, {
                intro:
                    "I need to correct my last message — here is what is actually confirmed in our booking system:",
            }),
            overridden: true,
            reason: "schedule_mismatch",
            mismatches,
        };
    }

    const claimsMultiple =
        claimsSuccess && /\b(three|3)\b/i.test(reply) && /\b(test\s+drive|appointment)/i.test(reply);
    if (claimsMultiple) {
        const active = upcoming.filter((b) => b.status !== "cancelled");
        if (active.length < 3) {
            return {
                reply: formatVerifiedUpcomingReply(active, {
                    intro: `I have ${active.length} confirmed test drive(s) saved — here is the accurate schedule:`,
                }),
                overridden: true,
                reason: "count_mismatch",
            };
        }
    }

    return { reply, overridden: false };
}
