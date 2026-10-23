/**
 * Pure automotive dashboard metric aggregation (no I/O).
 */
/** CRM pipeline stages — aligned with customerOpsRoutes / CRM services (no salesContext import). */
const CRM_PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
import { isDayInRange, parseInstantToUtcDay } from "./automotiveDateRange.js";
import { isTestDriveAppointment } from "./automotiveAppointmentClassifier.js";

const INVENTORY_SOURCE = "inventoryService.listVehiclesByCompany";
const CRM_SOURCE = "crmService.listLeads";
const APPOINTMENTS_SOURCE = "appointmentService.listAppointments";

const AVAILABILITY_BUCKETS = ["available", "reserved", "sold", "unavailable"];

export { isTestDriveAppointment };

function metricOk(value, source, extra = {}) {
    return { status: "ok", value, source, ...extra };
}

function metricEmpty(source, extra = {}) {
    return { status: "empty", value: 0, source, ...extra };
}

function metricUnavailable(source, reason, extra = {}) {
    return { status: "unavailable", value: null, source, reason, ...extra };
}

function resolveBodyType(vehicle) {
    const raw = vehicle.metadata?.bodyType || vehicle.metadata?.body_type;
    return raw ? String(raw).trim() : null;
}

function resolveStockCondition(vehicle) {
    const raw = vehicle.metadata?.condition || vehicle.metadata?.stockCondition;
    if (!raw) return null;
    const norm = String(raw).trim().toLowerCase();
    if (norm === "new" || norm === "used" || norm === "demo") return norm;
    return String(raw).trim();
}

/** Authoritative completed-sale calendar day only — never updatedAt. */
export function resolveAuthoritativeSaleDay(vehicle) {
    const soldAt =
        vehicle.metadata?.soldAt ||
        vehicle.metadata?.sold_at ||
        vehicle.metadata?.completedSaleAt ||
        vehicle.metadata?.completed_sale_at;
    if (!soldAt) return null;
    const day = parseInstantToUtcDay(soldAt);
    if (!day) return null;
    return { day, field: "metadata.soldAt" };
}

function resolveRealisedSaleAmount(vehicle) {
    const raw =
        vehicle.metadata?.salePrice ??
        vehicle.metadata?.sale_price ??
        vehicle.metadata?.transactionAmount ??
        vehicle.metadata?.transaction_amount ??
        vehicle.metadata?.realisedSalePrice;
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    return Number(raw);
}

function countByKey(items, keyFn) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const item of items) {
        const key = keyFn(item);
        if (!key) continue;
        out[key] = (out[key] || 0) + 1;
    }
    return out;
}

/**
 * @param {{
 *   vehicles: object[]|null,
 *   leads: object[]|null,
 *   appointments: object[]|null,
 *   period: object,
 *   todayUtc: string,
 *   dataCompanyId: string,
 *   nowMs: number,
 * }} input
 */
export function buildAutomotiveDashboardFromData(input) {
    const { vehicles, leads, appointments, period, todayUtc, dataCompanyId, nowMs } = input;

    return {
        schemaVersion: "1.0.0",
        presetId: "automotive-dealership",
        companyId: dataCompanyId,
        generatedAt: new Date(nowMs).toISOString(),
        period,
        inventory: buildInventoryMetrics(vehicles),
        sales: buildSalesMetrics(vehicles, period),
        crm: buildCrmMetrics(leads),
        appointments: buildAppointmentMetrics(appointments, period, todayUtc),
    };
}

function buildInventoryMetrics(vehicles) {
    if (vehicles === null) {
        return {
            totals: metricUnavailable(INVENTORY_SOURCE, "inventory_list_failed"),
            byAvailability: metricUnavailable(INVENTORY_SOURCE, "inventory_list_failed"),
        };
    }

    const tracked = vehicles.length;
    const byAvailability = Object.fromEntries(AVAILABILITY_BUCKETS.map((b) => [b, 0]));
    for (const v of vehicles) {
        const bucket = AVAILABILITY_BUCKETS.includes(v.availability) ? v.availability : "unavailable";
        byAvailability[bucket] += 1;
    }

    const byMake = countByKey(vehicles, (v) => (v.make ? String(v.make).trim() : null));
    const byBodyType = countByKey(vehicles, (v) => resolveBodyType(v));
    const byCondition = countByKey(vehicles, (v) => resolveStockCondition(v));

    const totalsMetric =
        tracked === 0
            ? metricEmpty(INVENTORY_SOURCE, {
                  definition: "All vehicle records returned for the tenant (one row per vehicleId)",
              })
            : metricOk(tracked, INVENTORY_SOURCE, {
                  definition: "All vehicle records returned for the tenant (one row per vehicleId)",
              });

    return {
        totals: totalsMetric,
        byAvailability: {
            available: metricOk(byAvailability.available, INVENTORY_SOURCE, { field: "availability" }),
            reserved: metricOk(byAvailability.reserved, INVENTORY_SOURCE, { field: "availability" }),
            sold: metricOk(byAvailability.sold, INVENTORY_SOURCE, { field: "availability" }),
            unavailable: metricOk(byAvailability.unavailable, INVENTORY_SOURCE, { field: "availability" }),
        },
        byMake: metricOk(byMake, INVENTORY_SOURCE, { field: "make" }),
        byBodyType: metricOk(byBodyType, INVENTORY_SOURCE, {
            field: "metadata.bodyType",
            note: "Only vehicles with body type metadata are counted",
        }),
        byCondition: Object.keys(byCondition).length
            ? metricOk(byCondition, INVENTORY_SOURCE, { field: "metadata.condition" })
            : metricUnavailable(INVENTORY_SOURCE, "no_condition_metadata_on_tracked_vehicles"),
    };
}

function buildSalesMetrics(vehicles, period) {
    if (vehicles === null) {
        return {
            unitsSoldInPeriod: metricUnavailable(INVENTORY_SOURCE, "inventory_list_failed"),
            realisedSalesValue: metricUnavailable(INVENTORY_SOURCE, "inventory_list_failed"),
            listingPriceSumForSoldInPeriod: metricUnavailable(INVENTORY_SOURCE, "inventory_list_failed"),
        };
    }

    const soldStatusWithoutTimestamp = vehicles.filter(
        (v) => v.availability === "sold" && !resolveAuthoritativeSaleDay(v)
    ).length;

    const soldInPeriod = [];
    for (const v of vehicles) {
        if (v.availability !== "sold") continue;
        const sale = resolveAuthoritativeSaleDay(v);
        if (!sale || !isDayInRange(sale.day, period.from, period.to)) continue;
        soldInPeriod.push(v);
    }

    const units = soldInPeriod.length;

    let realisedSum = 0;
    let realisedCount = 0;
    let listingSum = 0;
    let listingCount = 0;

    for (const v of soldInPeriod) {
        const realised = resolveRealisedSaleAmount(v);
        if (realised != null) {
            realisedSum += realised;
            realisedCount += 1;
        }
        if (v.price != null && Number.isFinite(Number(v.price))) {
            listingSum += Number(v.price);
            listingCount += 1;
        }
    }

    const unitsSoldInPeriod =
        units === 0
            ? metricEmpty(INVENTORY_SOURCE, {
                  definition: "Sold units with metadata.soldAt (or equivalent) within period",
                  periodField: "metadata.soldAt",
                  excludes: "Sold units without authoritative sale timestamp; CRM won",
              })
            : metricOk(units, INVENTORY_SOURCE, {
                  definition: "Sold units with metadata.soldAt (or equivalent) within period",
                  periodField: "metadata.soldAt",
                  soldStatusMissingSaleTimestamp: soldStatusWithoutTimestamp,
              });

    let realisedSalesValue;
    if (units === 0) {
        realisedSalesValue = metricEmpty(INVENTORY_SOURCE, {
            definition: "Sum of metadata sale/transaction amounts for units sold in period",
        });
    } else if (realisedCount === 0) {
        realisedSalesValue = metricUnavailable(INVENTORY_SOURCE, "no_authoritative_sale_amount_on_sold_units", {
            definition: "Requires metadata.salePrice or transactionAmount — not vehicle.price",
        });
    } else if (realisedCount < units) {
        realisedSalesValue = metricUnavailable(INVENTORY_SOURCE, "partial_sale_amount_data_for_period_units", {
            pricedUnits: realisedCount,
            unitsInPeriod: units,
        });
    } else {
        realisedSalesValue = metricOk(realisedSum, INVENTORY_SOURCE, {
            definition: "Sum of authoritative sale/transaction metadata for units sold in period",
            pricedUnits: realisedCount,
        });
    }

    let listingPriceSumForSoldInPeriod;
    if (units === 0) {
        listingPriceSumForSoldInPeriod = metricEmpty(INVENTORY_SOURCE, {
            definition: "Sum of vehicle.price for sold-in-period units — listing/asking price, not realised revenue",
        });
    } else if (listingCount === 0) {
        listingPriceSumForSoldInPeriod = metricUnavailable(INVENTORY_SOURCE, "sold_units_missing_listing_price");
    } else {
        listingPriceSumForSoldInPeriod = metricOk(listingSum, INVENTORY_SOURCE, {
            definition:
                "Sum of vehicle.price on sold-in-period units — current listing field, not proof of amount paid",
            pricedUnits: listingCount,
            notRealisedRevenue: true,
        });
    }

    return {
        unitsSoldInPeriod,
        realisedSalesValue,
        listingPriceSumForSoldInPeriod,
        grossProfit: metricUnavailable(INVENTORY_SOURCE, "acquisition_cost_not_in_canonical_inventory"),
        soldUnitsMissingSaleTimestamp: metricOk(soldStatusWithoutTimestamp, INVENTORY_SOURCE, {
            definition: "availability=sold but no metadata.soldAt — excluded from period sales counts",
        }),
    };
}

function buildCrmMetrics(leads) {
    if (leads === null) {
        return {
            byStage: metricUnavailable(CRM_SOURCE, "leads_list_failed"),
            openOpportunities: metricUnavailable(CRM_SOURCE, "leads_list_failed"),
        };
    }

    const byStage = Object.fromEntries(CRM_PIPELINE_STAGES.map((s) => [s, 0]));
    for (const lead of leads) {
        const stage = String(lead.stage || "new").toLowerCase();
        if (byStage[stage] != null) byStage[stage] += 1;
        else byStage.new += 1;
    }

    const openOpportunities = leads.filter((l) => {
        const s = String(l.stage || "").toLowerCase();
        return s !== "won" && s !== "lost";
    }).length;

    return {
        byStage: metricOk(byStage, CRM_SOURCE, {
            stages: [...CRM_PIPELINE_STAGES],
            field: "lead.stage",
        }),
        openOpportunities: metricOk(openOpportunities, CRM_SOURCE, {
            definition: "Leads whose stage is not won or lost",
        }),
        overdueFollowUps: metricUnavailable(CRM_SOURCE, "lead_follow_up_due_dates_not_in_canonical_model"),
    };
}

function buildAppointmentMetrics(appointmentsRaw, period, todayUtc) {
    if (appointmentsRaw === null) {
        return {
            upcomingInPeriod: metricUnavailable(APPOINTMENTS_SOURCE, "appointments_list_failed"),
            testDrivesInPeriod: metricUnavailable(APPOINTMENTS_SOURCE, "appointments_list_failed"),
        };
    }

    const appointments = appointmentsRaw.filter((a) => a.scheduledAt);
    const inPeriod = appointments.filter((a) => {
        const day = parseInstantToUtcDay(a.scheduledAt);
        return isDayInRange(day, period.from, period.to);
    });

    const byStatus = countByKey(inPeriod, (a) =>
        a.status ? String(a.status).toLowerCase() : "unknown"
    );

    const testDrives = inPeriod.filter(isTestDriveAppointment);
    const testDrivesToday = testDrives.filter((a) => parseInstantToUtcDay(a.scheduledAt) === todayUtc);

    return {
        upcomingInPeriod: metricOk(inPeriod.length, APPOINTMENTS_SOURCE, {
            definition: "Appointments with scheduledAt day within period",
            field: "scheduledAt",
        }),
        byStatus: metricOk(byStatus, APPOINTMENTS_SOURCE, { field: "status" }),
        testDrivesInPeriod: metricOk(testDrives.length, APPOINTMENTS_SOURCE, {
            definition: "appointmentType=test_drive or documented test-drive label heuristic",
        }),
        testDrivesTodayUtc: metricOk(testDrivesToday.length, APPOINTMENTS_SOURCE, {
            definition: "Test drives scheduled on today's UTC calendar day",
            timezonePolicy: period.timezonePolicy,
        }),
    };
}
