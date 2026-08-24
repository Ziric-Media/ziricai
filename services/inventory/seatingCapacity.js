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
 * Parse total passenger count from natural language (adults + children).
 * @param {string} text
 * @returns {number|null}
 */
export function countPassengersFromText(text) {
    const raw = String(text || "");
    const lower = raw.toLowerCase();

    const explicitTotal = lower.match(/\b(?:family\s*of|party\s*of|group\s*of|we\s*are|there\s*(?:are|is)\s*)\s*(\d{1,2})\b/);
    if (explicitTotal?.[1]) {
        const n = Number(explicitTotal[1]);
        if (n >= 1 && n <= 20) return n;
    }

    const equationTotal = raw.match(/=\s*(\d{1,2})\s*(?:people|passengers|of\s*us)?\b/i);
    if (equationTotal?.[1]) {
        const n = Number(equationTotal[1]);
        if (n >= 1 && n <= 20) return n;
    }

    const kidsPlusNames = raw.match(
        /\b(\d{1,2})\s*(?:kids|children)(?:\s*(?:\+|plus)\s*([a-z]+))?(?:\s*(?:\+|plus)\s*([a-z]+))?\s*=\s*(\d{1,2})/i
    );
    if (kidsPlusNames?.[4]) {
        return Number(kidsPlusNames[4]);
    }

    if (/\b(\d{1,2})\s*(?:kids|children)\b/i.test(raw) && /\b(?:plus|and)\b/i.test(raw)) {
        const kids = raw.match(/\b(\d{1,2})\s*(?:kids|children)\b/i);
        const eq = raw.match(/=\s*(\d{1,2})/);
        if (eq?.[1]) return Number(eq[1]);
        if (kids?.[1]) {
            const named = (raw.match(/\b[a-z]{3,}\b/gi) || []).filter(
                (w) => !/^(kids|children|plus|and|people|have|we)$/i.test(w)
            );
            return Number(kids[1]) + named.length;
        }
    }

    const peopleTotal = lower.match(/\b(\d{1,2})\s*(?:people|passengers|of\s*us|in\s*(?:our|the|my)\s*(?:family|household))\b/);
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
        if (/\b(?:plus|and)\s+(?:me|myself|spouse|wife|husband|partner)\b/.test(lower)) total += 1;
        if (/\bmyself\b/.test(lower) && !/\b(?:kids|children)\b/.test(lower)) total += 1;
        return total;
    }

    const namedCount = (raw.match(/\b(?:me|myself|spencer|palesa|wife|husband|spouse|partner)\b/gi) || []).length;
    const childWords = (lower.match(/\b(?:kids|children|child)\b/g) || []).length;
    if (namedCount >= 2 || (namedCount >= 1 && childWords)) {
        const childNum = lower.match(/\b(\d{1,2})\s*(?:kids|children)\b/);
        if (childNum?.[1]) return namedCount + Number(childNum[1]) - 1;
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
            warning: "Seating capacity unknown — confirm passenger count with sales consultant before recommending.",
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
 * Attach seatingCapacity to a public vehicle object.
 * @param {object} vehicle
 */
export function withSeatingCapacity(vehicle) {
    if (!vehicle) return vehicle;
    const seatingCapacity = getVehicleSeatingCapacity(vehicle);
    return seatingCapacity != null ? { ...vehicle, seatingCapacity } : vehicle;
}
