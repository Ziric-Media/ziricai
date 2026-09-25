#!/usr/bin/env node
/**
 * One-off probe: Sarah appointment ledger for Central Motors.
 * Usage: npx @railway/cli run --service ziricai -- node scripts/_probe-appointments-rtb.mjs
 */
import pg from "pg";

const ids = ["central-motors-rtb", "demo-central-motors"];

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL missing");
        process.exit(1);
    }
    const client = new pg.Client({
        connectionString: url,
        ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    await client.connect();

    const summary = await client.query(
        `SELECT company_id, status, COUNT(*)::int AS n,
                MIN(scheduled_at) AS min_at, MAX(scheduled_at) AS max_at
         FROM ziricai_appointments
         WHERE company_id = ANY($1::text[])
         GROUP BY 1, 2
         ORDER BY 1, 2`,
        [ids]
    );
    console.log("SUMMARY");
    console.log(JSON.stringify(summary.rows, null, 2));

    const detail = await client.query(
        `SELECT id, company_id, status, scheduled_at, customer_phone, vehicle_label
         FROM ziricai_appointments
         WHERE company_id = ANY($1::text[])
         ORDER BY scheduled_at DESC NULLS LAST
         LIMIT 25`,
        [ids]
    );
    console.log("DETAIL");
    console.log(JSON.stringify(detail.rows, null, 2));

    const now = new Date().toISOString();
    const future = detail.rows.filter(
        (r) => r.scheduled_at && new Date(r.scheduled_at).toISOString() >= now && r.status !== "cancelled"
    );
    const past = detail.rows.filter(
        (r) => r.scheduled_at && new Date(r.scheduled_at).toISOString() < now && r.status !== "cancelled"
    );
    console.log(
        JSON.stringify(
            {
                now,
                futureCountInSample: future.length,
                pastCountInSample: past.length,
                totalRows: detail.rows.length,
            },
            null,
            2
        )
    );

    await client.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
