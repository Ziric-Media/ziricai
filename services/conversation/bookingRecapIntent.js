/**
 * Detect booking recap / appointment lookup intents and format authoritative DB blocks.
 */

const BOOKING_RECAP_PATTERNS = [
    /\bwhat(?:'s| is| was)?\s+(?:my|the)\s+(?:test\s*drive|appointment|booking)\b/i,
    /\bwhat\s+(?:test\s*drive|vehicle|car)\s+(?:did i|have i|am i)\s+book/i,
    /\bwhat\s+am\s+i\s+test\s*driv/i,
    /\bwhat\s+did\s+i\s+book\b/i,
    /\bremind\s+me\b/i,
    /\bmy\s+appointment\b/i,
    /\bmy\s+test\s*drive\b/i,
    /\bwhen\s+is\s+my\s+(?:test\s*drive|appointment|booking)\b/i,
    /\bwhere\s+is\s+my\s+(?:test\s*drive|appointment|booking)\b/i,
    /\bwhich\s+vehicle\s+(?:did i|have i|am i)\s+book/i,
    /\bupcoming\s+(?:test\s*drive|appointment|booking)s?\b/i,
    /\bdo\s+i\s+have\s+(?:a|any)\s+(?:test\s*drive|appointment|booking)\b/i,
    /\bwhat\s+(?:time|date)\s+(?:is|was)\s+my\b/i,
    /\btest\s*drive\s+booked\b/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isBookingRecapIntent(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    return BOOKING_RECAP_PATTERNS.some((pattern) => pattern.test(raw));
}

/**
 * Format pre-fetched getCustomerBookings result for system prompt injection.
 * @param {object} bookingResult
 * @returns {string}
 */
export function formatAuthoritativeBookingBlock(bookingResult) {
    if (!bookingResult?.ok) {
        return "AUTHORITATIVE BOOKING DATA: lookup failed — tell the customer you could not retrieve bookings right now.";
    }

    const lines = [
        "AUTHORITATIVE BOOKING DATA (from database — the ONLY source for booking recap fields):",
        "The AI may explain these results, but must NOT invent or substitute vehicle, date, time, location, or stock number.",
        "",
        bookingResult.message || "No booking message returned.",
    ];

    if (Array.isArray(bookingResult.bookings) && bookingResult.bookings.length) {
        lines.push("", "Structured bookings (use exactly these values):");
        for (const b of bookingResult.bookings) {
            lines.push(
                `- bookingId: ${b.bookingId || "—"} | vehicle: ${b.vehicleDescription || "—"} | stock: ${b.stockNumber || "—"} | when: ${b.scheduledAt || "—"} | location: ${b.location || "—"} | status: ${b.status || "—"}`
            );
        }
    }

    return lines.join("\n");
}
