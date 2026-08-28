/**
 * Customer-facing WhatsApp vehicle card formatting — platform-owned presentation layer.
 * Internal IDs (vehicleId, stockNumber) stay in conversation state only.
 */

const STOCK_NUMBER_PATTERN = /\b(?:CM|ST|WP)-[A-Z0-9-]+\b/gi;
const VEHICLE_ID_PATTERN = /\bveh(?:icle)?[-_][a-z0-9-]+\b/gi;
const INTERNAL_ID_LINE = /^\s*(?:stock\s*(?:#|:)?|vehicle\s*id\s*:)\s*\S+/i;

/**
 * South African customer-facing currency — comma thousands separator (e.g. R399,900).
 * @param {number|null|undefined} amount
 */
export function formatRand(amount) {
    if (amount == null || Number.isNaN(Number(amount))) return null;
    return `R${Number(amount).toLocaleString("en-US")}`;
}

/**
 * @param {number|null|undefined} price
 */
export function formatPriceLine(price) {
    const formatted = formatRand(price);
    if (!formatted) return null;
    return `💰 Price: ${formatted}`;
}

/**
 * @param {number|null|undefined} mileage
 */
export function formatMileageLine(mileage) {
    if (mileage == null || Number.isNaN(Number(mileage))) return null;
    return `📏 Mileage: ${Number(mileage).toLocaleString("en-US")} km`;
}

/**
 * @param {string|null|undefined} transmission
 */
export function formatTransmissionLine(transmission) {
    if (!transmission || !String(transmission).trim()) return null;
    return `⚙️ Transmission: ${String(transmission).trim()}`;
}

/**
 * @param {string|null|undefined} fuel
 */
export function formatFuelLine(fuel) {
    if (!fuel || !String(fuel).trim()) return null;
    return `⛽ Fuel: ${String(fuel).trim()}`;
}

/**
 * Seating — show value when known; otherwise Phase 1.1 fallback for family-facing cards.
 * @param {object} vehicle
 */
export function formatSeatingLine(vehicle) {
    const seating =
        vehicle?.seatingCapacity ??
        vehicle?.metadata?.seatingCapacity ??
        null;
    if (seating != null && !Number.isNaN(Number(seating))) {
        return `👨‍👩‍👧‍👦 Seating: ${Number(seating)}`;
    }
    return `👨‍👩‍👧‍👦 Seating: Not specified in listing`;
}

/**
 * @param {string|null|undefined} location
 */
export function formatLocationLine(location) {
    if (!location || !String(location).trim()) return null;
    return `📍 Location: ${String(location).trim()}`;
}

/**
 * Finance estimate only when legitimately present in inventory data.
 * @param {object} vehicle
 */
export function formatFinanceLine(vehicle) {
    const raw = vehicle?.financeEstimate;
    if (!raw || !String(raw).trim()) return null;
    const text = String(raw).trim();
    if (/^from\s/i.test(text)) {
        return `💳 Finance Estimate: ${text}`;
    }
    return `💳 Finance Estimate: ${text}`;
}

/**
 * @param {object} vehicle
 */
export function formatVehicleTitle(vehicle) {
    if (vehicle?.title) return String(vehicle.title).trim();
    const built = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
    if (built) return built;
    return vehicle?.label || vehicle?.make || "Vehicle";
}

/**
 * Format optional Sarah recommendation line from vehicle + customer context.
 * @param {object} vehicle
 */
export function formatRecommendationLine(vehicle) {
    const reason = vehicle?.reason || vehicle?.recommendationReason || null;
    if (!reason || !String(reason).trim()) return null;
    return `Why I recommend it:\n${String(reason).trim()}`;
}

/**
 * Rank badge for top-3 inventory recommendations.
 * @param {number} index — 0-based
 */
export function formatRankBadge(index = 0) {
    if (index === 0) return "🥇 Best Match #1";
    if (index === 1) return "🥈 Best Match #2";
    if (index === 2) return "🥉 Alternative #3";
    return null;
}

/**
 * Format a numbered customer-facing vehicle card for WhatsApp.
 * @param {object} vehicle
 * @param {number} index — 0-based position in the recommendation list
 */
export function formatVehicleCustomerCard(vehicle, index = 0) {
    if (!vehicle) return "";

    const number = index + 1;
    const title = formatVehicleTitle(vehicle);
    const rankBadge = vehicle?.rankLabel || formatRankBadge(index);
    const titleLine = rankBadge ? `${rankBadge}\n🚗 ${number}. ${title}` : `🚗 ${number}. ${title}`;
    const lines = [titleLine, ""];

    const detailLines = [
        formatPriceLine(vehicle.price),
        formatMileageLine(vehicle.mileage),
        formatTransmissionLine(vehicle.transmission),
        formatFuelLine(vehicle.fuel),
        formatSeatingLine(vehicle),
        formatLocationLine(vehicle.location),
        formatFinanceLine(vehicle),
    ].filter(Boolean);

    lines.push(...detailLines);

    const recommendation = formatRecommendationLine(vehicle);
    if (recommendation) {
        lines.push("");
        lines.push(recommendation);
    }

    return lines.join("\n").trim();
}

/**
 * Remove internal identifiers and listing prose from LLM reply text.
 * @param {string} text
 * @param {object[]} [vehicles]
 */
export function stripInternalVehicleIdentifiersFromText(text, vehicles = []) {
    let result = String(text || "");

    result = result.replace(STOCK_NUMBER_PATTERN, "");
    result = result.replace(VEHICLE_ID_PATTERN, "");

    const makeTokens = new Set(
        vehicles
            .flatMap((v) => [v.make, v.model, v.title, v.stockNumber, v.vehicleId].filter(Boolean))
            .map((s) => String(s).toLowerCase())
    );

    const lines = result.split("\n");
    const kept = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (INTERNAL_ID_LINE.test(trimmed)) return false;
        if (/\bvehicleId\b/i.test(trimmed)) return false;
        const lower = trimmed.toLowerCase();
        if (lower.includes("stock number") || lower.includes("stock #")) return false;
        for (const token of makeTokens) {
            if (token.length >= 3 && /^(cm|st|wp|veh)-/i.test(token)) continue;
        }
        return true;
    });

    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {string} cardText
 */
export function assertCustomerCardHasNoInternalIds(cardText) {
    const text = String(cardText || "");
    if (STOCK_NUMBER_PATTERN.test(text)) return false;
    STOCK_NUMBER_PATTERN.lastIndex = 0;
    if (VEHICLE_ID_PATTERN.test(text)) return false;
    VEHICLE_ID_PATTERN.lastIndex = 0;
    if (/\bvehicleId\b/i.test(text)) return false;
    if (/Stock:\s*\S+/i.test(text)) return false;
    return true;
}
