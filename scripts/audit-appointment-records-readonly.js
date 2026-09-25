#!/usr/bin/env node
/**
 * Read-only appointment audit — Postgres + Firestore + getCustomerBookings.
 * Does NOT modify any data.
 *
 * Usage:
 *   npx @railway/cli run node scripts/audit-appointment-records-readonly.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const COMPANY_ID = process.env.AUDIT_COMPANY_ID || "central-motors-rtb";
const CUSTOMER_PHONE = process.env.AUDIT_CUSTOMER_PHONE || "27849000523";
const TARGET_DATE_PREFIX = process.env.AUDIT_TARGET_DATE || "2026-09-07";

function formatSlot(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-ZA", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Africa/Johannesburg",
    });
}

function summarizeRow(row) {
    return {
        id: row.id || row.bookingId,
        vehicle: row.vehicleDescription || row.vehicleName || row.metadata?.vehicleDescription || "—",
        vehicleId: row.vehicleId || row.metadata?.vehicleId || null,
        stockNumber: row.stockNumber || row.vehicleStockNumber || null,
        scheduledAt: row.scheduledAt || row.dateTime,
        scheduledLabel: formatSlot(row.scheduledAt || row.dateTime),
        status: row.status,
        customerId: row.customerId || row.phone || null,
        canonicalSource: row.canonicalSource || "postgres",
        idempotencyKey: row.idempotencyKey || null,
    };
}

async function queryPostgresRaw(pool) {
    const result = await pool.query(
        `SELECT id, company_id, customer_id, vehicle_stock_number, scheduled_at, status,
                idempotency_key, metadata, created_at, updated_at
         FROM ziricai_appointments
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY scheduled_at ASC`,
        [COMPANY_ID, CUSTOMER_PHONE]
    );
    return result.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        customerId: row.customer_id,
        vehicleStockNumber: row.vehicle_stock_number,
        scheduledAt: row.scheduled_at instanceof Date ? row.scheduled_at.toISOString() : row.scheduled_at,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}

async function queryFirestoreAppointments(db) {
    const snap = await db.collection(`companies/${COMPANY_ID}/appointments`).get();
    const rows = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        const phone = data.phone || data.customerId || "";
        if (String(phone).replace(/\D/g, "") !== CUSTOMER_PHONE) continue;
        rows.push({ id: doc.id, ...data });
    }
    rows.sort(
        (a, b) =>
            new Date(a.scheduledAt || a.dateTime || 0).getTime() -
            new Date(b.scheduledAt || b.dateTime || 0).getTime()
    );
    return rows;
}

function matchSarahClaim(postgresUpcoming) {
    const expected = [
        { label: "Ford Everest", timeHint: "12:00" },
        { label: "Changan Alsvin", timeHint: "12:30" },
        { label: "Suzuki Ciaz", timeHint: "13:00" },
    ];

    const onTargetDate = postgresUpcoming.filter((row) => {
        const iso = row.scheduledAt || "";
        return iso.startsWith(TARGET_DATE_PREFIX) && row.status !== "cancelled";
    });

    const matches = expected.map((exp) => {
        const found = onTargetDate.find((row) => {
            const vehicle = String(
                row.vehicleDescription || row.metadata?.vehicleDescription || row.vehicleStockNumber || ""
            ).toLowerCase();
            const slot = formatSlot(row.scheduledAt).toLowerCase();
            const vehicleMatch =
                (exp.label.includes("Everest") && vehicle.includes("everest")) ||
                (exp.label.includes("Changan") && vehicle.includes("changan")) ||
                (exp.label.includes("Ciaz") && vehicle.includes("ciaz"));
            const timeMatch = slot.includes(exp.timeHint.replace(":", ":")) ||
                slot.includes(exp.timeHint.replace(":00", ":00")) ||
                (exp.timeHint === "13:00" && (slot.includes("1:00") || slot.includes("13:00")));
            return vehicleMatch && timeMatch;
        });
        return { expected: `${exp.label} @ ${exp.timeHint}`, found: found ? summarizeRow(found) : null };
    });

    return { onTargetDate: onTargetDate.map(summarizeRow), matches };
}

async function main() {
    const { getAppointmentBackendName, listAppointmentsByCustomer } = await import(
        "../services/database/appointmentRepository.js"
    );
    const { getPostgresPool, isPostgresConfigured } = await import("../services/database/postgresClient.js");
    const getCustomerBookings = (await import("../services/tools/getCustomerBookings.js")).default;
    const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");

    console.log("\n=== READ-ONLY APPOINTMENT AUDIT ===\n");
    console.log("Company:", COMPANY_ID);
    console.log("Customer phone:", CUSTOMER_PHONE);
    console.log("Target date (Sarah claim):", TARGET_DATE_PREFIX);
    console.log("Appointment backend:", getAppointmentBackendName());
    console.log("Postgres configured:", isPostgresConfigured());
    console.log("Firestore Admin:", hasAdminCredentials());
    console.log("Authoritative for Sarah/getCustomerBookings: PostgreSQL ziricai_appointments");
    console.log("CRM mirror: Firestore companies/{companyId}/appointments/{postgresUuid}\n");

    const ctx = {
        companyId: COMPANY_ID,
        customerId: CUSTOMER_PHONE,
        customerPhone: CUSTOMER_PHONE,
        customerName: "Spencer",
    };

    // getCustomerBookings (what Sarah should cite)
    const bookingsTool = await getCustomerBookings.execute(ctx, { statusFilter: "all", limit: 50 });
    const toolBookings = bookingsTool?.bookings || bookingsTool?.data?.bookings || [];

    // Postgres enriched list
    const postgresEnriched = await listAppointmentsByCustomer({
        companyId: COMPANY_ID,
        customerId: CUSTOMER_PHONE,
        statusFilter: "all",
        limit: 50,
    });

    const postgresUpcoming = await listAppointmentsByCustomer({
        companyId: COMPANY_ID,
        customerId: CUSTOMER_PHONE,
        statusFilter: "upcoming",
        limit: 50,
    });

    // Raw Postgres
    let postgresRaw = [];
    const pool = await getPostgresPool();
    if (pool) {
        postgresRaw = await queryPostgresRaw(pool);
    }

    // Firestore mirror
    let firestoreRows = [];
    if (hasAdminCredentials()) {
        const db = getAdminFirestore();
        if (db) firestoreRows = await queryFirestoreAppointments(db);
    }

    console.log("--- PostgreSQL (authoritative) — all records ---");
    console.log(`Count: ${postgresRaw.length}`);
    for (const row of postgresRaw) {
        const enriched = postgresEnriched.find((e) => e.id === row.id);
        console.log(JSON.stringify(summarizeRow(enriched || row), null, 0));
    }

    console.log("\n--- PostgreSQL upcoming (enriched) ---");
    console.log(`Count: ${postgresUpcoming.length}`);
    for (const row of postgresUpcoming) {
        console.log(JSON.stringify(summarizeRow(row), null, 0));
    }

    console.log("\n--- Firestore CRM mirror (this customer) ---");
    console.log(`Count: ${firestoreRows.length}`);
    for (const row of firestoreRows) {
        console.log(
            JSON.stringify({
                id: row.id,
                vehicleName: row.vehicleName || row.vehicleDescription,
                vehicleId: row.vehicleId,
                stockNumber: row.stockNumber || row.vehicleStockNumber,
                scheduledLabel: formatSlot(row.scheduledAt || row.dateTime),
                status: row.status,
                canonicalSource: row.canonicalSource || "firestore-only",
                customerId: row.customerId || row.phone,
            })
        );
    }

    console.log("\n--- getCustomerBookings tool output ---");
    console.log(`Count: ${toolBookings.length}`);
    console.log("Message preview:", (bookingsTool?.message || "").slice(0, 500));
    for (const row of toolBookings) {
        console.log(JSON.stringify(summarizeRow(row), null, 0));
    }

    const claim = matchSarahClaim(postgresEnriched);
    console.log("\n--- Sarah claim verification (2026-09-07 staggered plan) ---");
    console.log(`Appointments on ${TARGET_DATE_PREFIX} (non-cancelled):`, claim.onTargetDate.length);
    for (const m of claim.matches) {
        console.log(
            m.found
                ? `✓ ${m.expected} → FOUND id=${m.found.id} status=${m.found.status}`
                : `✗ ${m.expected} → NOT FOUND in Postgres`
        );
    }

    // Mirror sync check
    const postgresIds = new Set(postgresRaw.map((r) => r.id));
    const firestoreIds = new Set(firestoreRows.map((r) => r.id));
    const missingInFirestore = [...postgresIds].filter((id) => !firestoreIds.has(id));
    const firestoreOnly = [...firestoreIds].filter((id) => !postgresIds.has(id));

    console.log("\n--- Sync integrity ---");
    console.log("Postgres IDs missing from Firestore mirror:", missingInFirestore.length ? missingInFirestore : "none");
    console.log("Firestore-only IDs (no Postgres row):", firestoreOnly.length ? firestoreOnly : "none");

    const allThreeFound = claim.matches.every((m) => m.found && m.found.status !== "cancelled");
    console.log("\n=== VERDICT ===");
    console.log(
        allThreeFound
            ? "Sarah's claim IS supported: all three vehicles have confirmed Postgres appointments on the target date."
            : "Sarah's claim is NOT fully supported: one or more expected appointments are missing or mismatched in Postgres."
    );
    console.log("");
}

main().catch((err) => {
    console.error("Audit failed:", err.message);
    console.error(err.stack);
    process.exit(1);
});
