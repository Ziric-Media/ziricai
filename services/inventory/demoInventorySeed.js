/**
 * Parse demo knowledge inventory docs into canonical vehicle records and seed inventoryService.
 */
import { CENTRAL_MOTORS_INVENTORY_DOCS } from "../storage/demoCentralMotorsInventory.js";
import { seedVehicles } from "./inventoryService.js";

function parseField(content, label) {
    const re = new RegExp(`^${label}:\\s*(.+)$`, "im");
    const match = content.match(re);
    return match ? match[1].trim() : null;
}

function parsePrice(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
}

function parseMileage(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
}

function parseAvailability(raw) {
    const text = String(raw || "").toLowerCase();
    if (text.includes("sold")) return "sold";
    if (text.includes("reserved")) return "reserved";
    if (text.includes("unavailable")) return "unavailable";
    return "available";
}

function parseModelLine(modelLine) {
    if (!modelLine) return { make: null, model: null, trim: null };
    const parts = modelLine.trim().split(/\s+/);
    const make = parts[0] || null;
    const model = parts.slice(1).join(" ") || null;
    return { make, model, trim: null };
}

/**
 * Convert a knowledge-base inventory document to a canonical vehicle record.
 * @param {object} doc
 * @param {string} companyId
 */
export function inventoryDocToVehicle(doc, companyId) {
    const content = String(doc.content || "");
    if (!content.includes("Stock Number:")) return null;

    const modelLine = parseField(content, "Model");
    const { make, model } = parseModelLine(modelLine);
    const stockNumber = parseField(content, "Stock Number");

    return {
        vehicleId: doc.id || `veh-${stockNumber}`,
        companyId,
        stockNumber,
        make,
        model,
        year: parseField(content, "Year") ? Number(parseField(content, "Year")) : null,
        trim: parseField(content, "Trim"),
        mileage: parseMileage(parseField(content, "Mileage")),
        price: parsePrice(parseField(content, "Price")),
        transmission: parseField(content, "Transmission"),
        fuel: parseField(content, "Fuel"),
        location: parseField(content, "Location"),
        financeEstimate: parseField(content, "Finance Estimate"),
        images: [],
        availability: parseAvailability(parseField(content, "Availability")),
        title: doc.title || modelLine,
        metadata: { sourceDocId: doc.id || null },
    };
}

/**
 * @param {string} companyId
 * @param {object[]} [docs]
 */
export async function seedDemoInventoryFromDocs(companyId, docs = CENTRAL_MOTORS_INVENTORY_DOCS) {
    const vehicles = docs
        .map((doc) => inventoryDocToVehicle(doc, companyId))
        .filter(Boolean);
    return seedVehicles(companyId, vehicles);
}
