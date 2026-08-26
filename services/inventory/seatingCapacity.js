/**
 * Vehicle seating capacity — metadata override, model defaults, and passenger-fit checks.
 */

const MODEL_SEATING_DEFAULTS = [
    { pattern: /\bfortuner\b/i, seats: 7 },
    { pattern: /\beverest\b/i, seats: 7 },
    { pattern: /\bland\s*cruiser\b/i, seats: 8 },
    { pattern: /\bquantum\b/i, seats: 11 },
    { pattern: /\bstell(?:er|ar)\b/i, seats: 7 },
    { pattern: /\bhilux\b/i, seats: 5 },
    { pattern: /\branger\b/i, seats: 5 },
    { pattern: /\bx5\b/i, seats: 5 },
    { pattern: /\bx3\b/i, seats: 5 },
    { pattern: /\bpolo\b/i, seats: 5 },
    { pattern: /\bdouble\s*cab\b/i, seats: 5 },
    { pattern: /\bsingle\s*cab\b/i, seats: 3 },
];

const CURRENCY_AMOUNT_PATTERN =
    /\bR\s?[\d][\d,\s\u00A0\u202F]*(?:\.\d{2})?(?:k|K)?(?:\s*(?:per\s*month|\/\s*pm|p\.?\s*m\.?|monthly))?/gi;

/**
 * Remove salary/currency tokens so digits in amounts are not counted as passengers.
 * @param {string} text
 */
export function stripCurrencyFromPassengerText(text) {
    return String(text || "").replace(CURRENCY_AMOUNT_PATTERN, " ");
}

/**
 * Resolve seating capacity for a vehicle record.
 * @param {object|null|undefined} vehicle
 * @returns {number|null}
 */
export function getVehicleSeatingCapacity(vehicle) {
    if (!vehicle) return null;

    const fromMeta =
        vehicle.metadata?.seatingCapacity ??
        vehicle.metadata?.seats ??
        vehicle.seatingCapacity ??
        vehicle.seats;
    if (fromMeta != null && Number.isFinite(Number(fromMeta))) {
        return Number(fromMeta);
    }

    const hay = [vehicle.title, vehicle.model, vehicle.trim, vehicle.make].filter(Boolean).join(" ");
    for (const { pattern, seats } of MODEL_SEATING_DEFAULTS) {
        if (pattern.test(hay)) return seats;
    }
    return null;
}

/**
 * Parse "N kids + spouse" style family — customer (1) + spouse (1) + N children.
 * @param {string} lower
 * @returns {number|null}
 */
function parseKidsWithSpouseCount(lower) {
    const kidsThenSpouse = lower.match(
        /\b(\d{1,2})\s*(?:kids|children|child)\b[\s\S]{0,80}\b(?:my\s+)?(?:wife|husband|spouse|partner)\b/
    );
    if (kidsThenSpouse?.[1]) {
        const kids = Number(kidsThenSpouse[1]);
        if (kids >= 1 && kids <= 15) return kids + 2;
    }

    const spouseThenKids = lower.match(
        /\b(?:my\s+)?(?:wife|husband|spouse|partner)\b[\s\S]{0,80}\b(\d{1,2})\s*(?:kids|children|child)\b/
    );
    if (spouseThenKids?.[1]) {
        const kids = Number(spouseThenKids[1]);
        if (kids >= 1 && kids <= 15) return kids + 2;
    }

    return null;
}

/**
 * Parse total passenger count from natural language (adults + children).
 * @param {string} text
 * @returns {number|null}
 */
export function countPassengersFromText(text) {
    const raw = String(text || "");
    const sanitized = stripCurrencyFromPassengerText(raw);
    const lower = sanitized.toLowerCase();

    const explicitTotal = lower.match(
        /\b(?:family\s*of|party\s*of|group\s*of|we\s*are|there\s*(?:are|is)\s*)\s*(\d{1,2})\b/
    );
    if (explicitTotal?.[1]) {
        const n = Number(explicitTotal[1]);
        if (n >= 1 && n <= 20) return n;
    }

    const equationTotal = sanitized.match(/=\s*(\d{1,2})\s*(?:people|passengers|of\s*us)?\b/i);
    if (equationTotal?.[1]) {
        const n = Number(equationTotal[1]);
        if (n >= 1 && n <= 20) return n;
    }

    const kidsPlusNames = sanitized.match(
        /\b(\d{1,2})\s*(?:kids|children)(?:\s*(?:\+|plus)\s*([a-z]+))?(?:\s*(?:\+|plus)\s*([a-z]+))?\s*=\s*(\d{1,2})/i
    );
    if (kidsPlusNames?.[4]) {
        return Number(kidsPlusNames[4]);
    }

    const kidsWithSpouse = parseKidsWithSpouseCount(lower);
    if (kidsWithSpouse != null) return kidsWithSpouse;

    const peopleTotal = lower.match(
        /\b(\d{1,2})\s*(?:people|passengers|of\s*us|in\s*(?:our|the|my)\s*(?:family|household))\b/
    );
    if (peopleTotal?.[1]) {
        const n = Number(peopleTotal[1]);
        if (n >= 1 && n <= 20) return n;
    }

    let total = 0;
    const kidsMatch = lower.match(/\b(\d{1,2})\s*(?:kids|children|child)\b/);
    if (kidsMatch?.[1]) total += Number(kidsMatch[1]);

    const adultsMatch = lower.match(/\b(\d{1,2})\s*(?:adults|parents)\b/);
    if (adultsMatch?.[1]) total += Number(adultsMatch[1]);

    if (total > 0) {
        const hasSpouse = /\b(?:my\s+)?(?:wife|husband|spouse|partner)\b/.test(lower);
        const hasSelf = /\b(?:plus|and)\s+(?:me|myself)\b/.test(lower) || /\bmyself\b/.test(lower);
        if (hasSpouse) total += 2;
        else if (hasSelf) total += 1;
        else if (/\b(?:plus|and)\s+(?:me|myself|spouse|wife|husband|partner)\b/.test(lower)) total += 1;
        return total;
    }

    return null;
}

/**
 * @param {number} passengerCount
 * @param {object} vehicle
 * @returns {{ fits: boolean, capacity: number|null, passengerCount: number, warning: string|null }}
 */
export function evaluateSeatingFit(passengerCount, vehicle) {
    const count = Number(passengerCount);
    const capacity = getVehicleSeatingCapacity(vehicle);

    if (!Number.isFinite(count) || count < 1) {
        return { fits: true, capacity, passengerCount: count, warning: null };
    }
    if (capacity == null) {
        return {
            fits: true,
            capacity: null,
            passengerCount: count,
            warning:
                "This listing does not specify seating capacity — confirm with a sales consultant before recommending.",
        };
    }

    const fits = count <= capacity;
    const label = vehicle?.title || vehicle?.label || [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
    const warning = fits
        ? null
        : `${label || "This vehicle"} seats ${capacity} — not enough for ${count} passengers. Recommend an ${count}-seater or larger from inventory (searchInventory with minSeats), or explain generally without claiming stock.`;

    return { fits, capacity, passengerCount: count, warning };
}

/**
 * Sanitize LLM/tool minSeats — familySize is for warnings, not impossible inventory filters.
 * @param {number|null|undefined} requestedMinSeats
 * @param {number|null|undefined} familySize
 * @returns {number|null}
 */
export function resolveMinSeatsFilter(requestedMinSeats, familySize = null) {
    if (requestedMinSeats == null) return null;
    const n = Number(requestedMinSeats);
    if (!Number.isFinite(n) || n < 1 || n > 12) return null;
    if (familySize != null && n > familySize + 1) return null;
    return n;
}

/**
 * Attach seatingCapacity to a public vehicle object.
 * @param {object} vehicle
 */
export function withSeatingCapacity(vehicle) {
    if (!vehicle) return vehicle;
    const seatingCapacity = getVehicleSeatingCapacity(vehicle);
    return seatingCapacity != null ? { ...vehicle, seatingCapacity } : vehicle;
}
