/**
 * Canonical tenant-scoped vehicle inventory — single source of truth for search + booking.
 * Postgres when DATABASE_URL is set; in-memory fallback for local dev/tests.
 */
import { randomUUID } from "crypto";
import { getPostgresPool, isPostgresConfigured } from "../database/postgresClient.js";
import { getVehicleSeatingCapacity, withSeatingCapacity } from "./seatingCapacity.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ziricai_inventory_vehicles (
    vehicle_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    stock_number TEXT NOT NULL,
    make TEXT,
    model TEXT,
    year INTEGER,
    trim TEXT,
    mileage INTEGER,
    price NUMERIC,
    transmission TEXT,
    fuel TEXT,
    location TEXT,
    finance_estimate TEXT,
    images JSONB NOT NULL DEFAULT '[]',
    availability TEXT NOT NULL DEFAULT 'available',
    title TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, vehicle_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ziricai_inventory_stock
    ON ziricai_inventory_vehicles (company_id, stock_number);
`;

/** @type {Map<string, object>} key: companyId::vehicleId */
const memoryByKey = new Map();
/** @type {Map<string, object>} key: companyId::stockNumber */
const memoryByStock = new Map();

let schemaReady = false;

export function normalizeStockNumber(stockNumber) {
    return String(stockNumber || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function memoryVehicleKey(companyId, vehicleId) {
    return `${companyId}::${vehicleId}`;
}

function memoryStockKey(companyId, stockNumber) {
    return `${companyId}::${normalizeStockNumber(stockNumber)}`;
}

function rowToVehicle(row) {
    return {
        vehicleId: row.vehicle_id,
        companyId: row.company_id,
        stockNumber: row.stock_number,
        make: row.make,
        model: row.model,
        year: row.year != null ? Number(row.year) : null,
        trim: row.trim,
        mileage: row.mileage != null ? Number(row.mileage) : null,
        price: row.price != null ? Number(row.price) : null,
        transmission: row.transmission,
        fuel: row.fuel,
        location: row.location,
        financeEstimate: row.finance_estimate,
        images: Array.isArray(row.images) ? row.images : [],
        availability: row.availability || "available",
        title: row.title,
        metadata: row.metadata || {},
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

function normalizeVehicleInput(input) {
    const vehicleId = input.vehicleId || input.id || randomUUID();
    const stockNumber = normalizeStockNumber(input.stockNumber);
    if (!stockNumber) throw new Error("stockNumber is required");

    return {
        vehicleId,
        companyId: input.companyId,
        stockNumber,
        make: input.make || null,
        model: input.model || null,
        year: input.year != null ? Number(input.year) : null,
        trim: input.trim || null,
        mileage: input.mileage != null ? Number(input.mileage) : null,
        price: input.price != null ? Number(input.price) : null,
        transmission: input.transmission || null,
        fuel: input.fuel || null,
        location: input.location || null,
        financeEstimate: input.financeEstimate || null,
        images: Array.isArray(input.images) ? input.images : [],
        availability: input.availability || "available",
        title: input.title || null,
        metadata: input.metadata || {},
    };
}

function vehicleToPublic(vehicle) {
    if (!vehicle) return null;
    const base = {
        vehicleId: vehicle.vehicleId,
        stockNumber: vehicle.stockNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        price: vehicle.price,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        location: vehicle.location,
        financeEstimate: vehicle.financeEstimate,
        images: vehicle.images || [],
        availability: vehicle.availability,
        title: vehicle.title,
        label: vehicle.title || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
    };
    return withSeatingCapacity(base);
}

async function ensureSchema() {
    if (schemaReady) return;
    const pool = await getPostgresPool();
    if (pool) await pool.query(SCHEMA_SQL);
    schemaReady = true;
}

export function getInventoryBackendName() {
    return isPostgresConfigured() ? "postgres" : "memory";
}

export function isVehicleAvailable(vehicle) {
    if (!vehicle) return false;
    const status = String(vehicle.availability || "").toLowerCase();
    if (status === "sold" || status === "unavailable" || status === "reserved") return false;
    return true;
}

/**
 * Upsert a vehicle record for a tenant.
 * @param {object} input
 */
export async function upsertVehicle(input) {
    await ensureSchema();
    const vehicle = normalizeVehicleInput(input);
    if (!vehicle.companyId) throw new Error("companyId is required");

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `INSERT INTO ziricai_inventory_vehicles (
                vehicle_id, company_id, stock_number, make, model, year, trim, mileage, price,
                transmission, fuel, location, finance_estimate, images, availability, title, metadata
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            ON CONFLICT (company_id, vehicle_id) DO UPDATE SET
                stock_number = EXCLUDED.stock_number,
                make = EXCLUDED.make,
                model = EXCLUDED.model,
                year = EXCLUDED.year,
                trim = EXCLUDED.trim,
                mileage = EXCLUDED.mileage,
                price = EXCLUDED.price,
                transmission = EXCLUDED.transmission,
                fuel = EXCLUDED.fuel,
                location = EXCLUDED.location,
                finance_estimate = EXCLUDED.finance_estimate,
                images = EXCLUDED.images,
                availability = EXCLUDED.availability,
                title = EXCLUDED.title,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING *`,
            [
                vehicle.vehicleId,
                vehicle.companyId,
                vehicle.stockNumber,
                vehicle.make,
                vehicle.model,
                vehicle.year,
                vehicle.trim,
                vehicle.mileage,
                vehicle.price,
                vehicle.transmission,
                vehicle.fuel,
                vehicle.location,
                vehicle.financeEstimate,
                JSON.stringify(vehicle.images),
                vehicle.availability,
                vehicle.title,
                JSON.stringify(vehicle.metadata),
            ]
        );
        return rowToVehicle(result.rows[0]);
    }

    const record = {
        ...vehicle,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    memoryByKey.set(memoryVehicleKey(vehicle.companyId, vehicle.vehicleId), record);
    memoryByStock.set(memoryStockKey(vehicle.companyId, vehicle.stockNumber), record);
    return record;
}

/**
 * @param {string} companyId
 * @param {object[]} vehicles
 */
export async function seedVehicles(companyId, vehicles) {
    const saved = [];
    for (const v of vehicles) {
        saved.push(await upsertVehicle({ ...v, companyId }));
    }
    return saved;
}

export async function getVehicleById(companyId, vehicleId) {
    if (!companyId || !vehicleId) return null;
    await ensureSchema();

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_inventory_vehicles WHERE company_id = $1 AND vehicle_id = $2 LIMIT 1`,
            [companyId, vehicleId]
        );
        return result.rows[0] ? rowToVehicle(result.rows[0]) : null;
    }

    return memoryByKey.get(memoryVehicleKey(companyId, vehicleId)) || null;
}

export async function getVehicleByStockNumber(companyId, stockNumber) {
    if (!companyId || !stockNumber) return null;
    await ensureSchema();
    const normalized = normalizeStockNumber(stockNumber);

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_inventory_vehicles WHERE company_id = $1 AND stock_number = $2 LIMIT 1`,
            [companyId, normalized]
        );
        return result.rows[0] ? rowToVehicle(result.rows[0]) : null;
    }

    return memoryByStock.get(memoryStockKey(companyId, normalized)) || null;
}

function scoreVehicle(vehicle, terms) {
    const hay = [
        vehicle.title,
        vehicle.make,
        vehicle.model,
        vehicle.trim,
        vehicle.stockNumber,
        vehicle.transmission,
        vehicle.fuel,
        vehicle.location,
        String(vehicle.year),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
}

function normalizeMake(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/s$/, "");
}

/** Model keywords → brand/make for inventory search. */
const MODEL_BRAND_HINTS = {
    hilux: "Toyota",
    fortuner: "Toyota",
    corolla: "Toyota",
    rav4: "Toyota",
    everest: "Ford",
    ranger: "Ford",
    figo: "Ford",
    x5: "BMW",
    x3: "BMW",
    "3 series": "BMW",
    "5 series": "BMW",
    polo: "Volkswagen",
    golf: "Volkswagen",
    tiguan: "Volkswagen",
};

const BRAND_CANONICAL = {
    toyota: "Toyota",
    ford: "Ford",
    bmw: "BMW",
    vw: "Volkswagen",
    volkswagen: "Volkswagen",
    mercedes: "Mercedes-Benz",
    "mercedes-benz": "Mercedes-Benz",
    audi: "Audi",
    nissan: "Nissan",
    isuzu: "Isuzu",
    mazda: "Mazda",
    hyundai: "Hyundai",
    kia: "Kia",
    mg: "MG",
};

/**
 * Detect make / excludeMake hints from a natural-language inventory query.
 * @param {string} query
 * @returns {{ make?: string, makes?: string[], excludeMake?: string }}
 */
export function detectBrandHintsFromQuery(query = "") {
    const raw = String(query || "").toLowerCase();
    const hints = {};
    const makes = new Set();

    const excludeMatch = raw.match(
        /\b(?:different|other|another|non|besides|except|excluding)\s+(?:brand[s]?|make[s]?)?\s*(?:besides|except|from|than)?\s*([a-z][a-z\s-]{1,20})\b/i
    );
    if (excludeMatch?.[1]) {
        const excluded = normalizeMake(excludeMatch[1]);
        hints.excludeMake = BRAND_CANONICAL[excluded] || capitalizeMake(excluded);
    }

    const excludedNormalized = hints.excludeMake ? normalizeMake(hints.excludeMake) : null;

    for (const [model, make] of Object.entries(MODEL_BRAND_HINTS)) {
        if (raw.includes(model)) {
            if (!excludedNormalized || normalizeMake(make) !== excludedNormalized) {
                makes.add(make);
            }
        }
    }

    if (!makes.size) {
        for (const [alias, make] of Object.entries(BRAND_CANONICAL)) {
            if (raw.includes(alias)) {
                if (!excludedNormalized || normalizeMake(make) !== excludedNormalized) {
                    makes.add(make);
                }
            }
        }
    }

    if (makes.size === 1) {
        hints.make = [...makes][0];
    } else if (makes.size > 1) {
        hints.makes = [...makes];
    }

    return hints;
}

function capitalizeMake(value) {
    if (!value) return null;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractSearchTerms(query) {
    const raw = String(query || "").toLowerCase();
    const terms = raw.split(/\W+/).filter((w) => w.length >= 2 || w === "x5" || w === "x3" || w === "vw" || w === "mg");
    for (const kw of [
        "hilux",
        "fortuner",
        "toyota",
        "everest",
        "ford",
        "bmw",
        "x5",
        "x3",
        "diesel",
        "automatic",
        "manual",
        "budget",
        "vw",
        "mg",
    ]) {
        if (raw.includes(kw) && !terms.includes(kw)) terms.push(kw);
    }
    return terms;
}

function matchesFilters(vehicle, filters = {}) {
    if (filters.availabilityOnly && !isVehicleAvailable(vehicle)) return false;
    if (filters.excludeMake) {
        const exclude = normalizeMake(filters.excludeMake);
        const vehicleMake = normalizeMake(vehicle.make);
        if (vehicleMake && (vehicleMake === exclude || vehicleMake.includes(exclude) || exclude.includes(vehicleMake))) {
            return false;
        }
    }
    if (filters.make) {
        const mk = normalizeMake(filters.make);
        const vehicleMake = normalizeMake(vehicle.make);
        if (!vehicleMake || (!vehicleMake.includes(mk) && !mk.includes(vehicleMake))) return false;
    }
    if (Array.isArray(filters.makes) && filters.makes.length) {
        const allowed = filters.makes.map((m) => normalizeMake(m));
        const vehicleMake = normalizeMake(vehicle.make);
        if (!vehicleMake || !allowed.some((mk) => vehicleMake.includes(mk) || mk.includes(vehicleMake))) {
            return false;
        }
    }
    if (filters.model && !String(vehicle.model || "").toLowerCase().includes(String(filters.model).toLowerCase())) {
        return false;
    }
    if (filters.maxPrice != null && vehicle.price != null && vehicle.price > filters.maxPrice) return false;
    if (filters.minPrice != null && vehicle.price != null && vehicle.price < filters.minPrice) return false;
    if (filters.minSeats != null) {
        const seats = getVehicleSeatingCapacity(vehicle);
        if (seats == null || seats < filters.minSeats) return false;
    }
    return true;
}

async function listAllVehicles(companyId) {
    await ensureSchema();
    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_inventory_vehicles WHERE company_id = $1 ORDER BY updated_at DESC`,
            [companyId]
        );
        return result.rows.map(rowToVehicle);
    }

    return [...memoryByKey.values()].filter((v) => v.companyId === companyId);
}

/**
 * @param {string} companyId
 * @param {string} [query]
 * @param {object} [filters]
 */
export async function searchInventory(companyId, query = "", filters = {}) {
    const brandHints = detectBrandHintsFromQuery(query);
    const mergedFilters = {
        ...filters,
        make: filters.make || brandHints.make,
        makes: filters.makes || brandHints.makes,
        excludeMake: filters.excludeMake || brandHints.excludeMake,
    };

    const all = await listAllVehicles(companyId);
    const terms = extractSearchTerms(query);
    let results = all.filter((v) => matchesFilters(v, mergedFilters));

    if (terms.length) {
        const scored = results
            .map((v) => ({ vehicle: v, score: scoreVehicle(v, terms) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((r) => r.vehicle);
        if (scored.length || !mergedFilters.excludeMake) {
            results = scored;
        }
    }

    const limit = filters.limit || 10;
    return results.slice(0, limit).map(vehicleToPublic);
}

export { detectBrandHintsFromQuery as detectBrandHints };

/**
 * Suggest available alternatives when requested vehicle is unavailable or not found.
 */
export async function listAlternatives(companyId, { make, model, excludeVehicleId, limit = 5 } = {}) {
    const all = await listAllVehicles(companyId);
    let candidates = all.filter((v) => isVehicleAvailable(v) && v.vehicleId !== excludeVehicleId);

    if (make) {
        const mk = String(make).toLowerCase();
        candidates = candidates.filter((v) => String(v.make || "").toLowerCase().includes(mk));
    }
    if (model) {
        const md = String(model).toLowerCase();
        candidates = candidates.filter((v) => String(v.model || "").toLowerCase().includes(md));
    }

    return candidates.slice(0, limit).map(vehicleToPublic);
}

export async function resolveVehicle(companyId, { vehicleId, stockNumber } = {}) {
    if (vehicleId) {
        const byId = await getVehicleById(companyId, vehicleId);
        if (byId) return byId;
    }
    if (stockNumber) {
        return getVehicleByStockNumber(companyId, stockNumber);
    }
    return null;
}

/** Test helper — reset in-memory store. */
export function _resetMemoryInventoryForTests() {
    memoryByKey.clear();
    memoryByStock.clear();
    schemaReady = false;
}

export { vehicleToPublic };
