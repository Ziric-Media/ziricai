# BCS-03 — Babes inventory & business configuration

**Date:** 2026-11-23  
**Status:** **Complete** (website sitemap sync; Central Motors untouched)

## Inventory source

- **Source of truth for this gate:** [babescarsales.co.za](https://babescarsales.co.za/) **listings sitemap** (`/listings-sitemap.xml`), same Motors Theme (STM) HTML pattern as Central Motors but **separate adapter** (`babesCarSalesAdapter.js`).
- Each vehicle record includes `metadata.verifiedAt` and `metadata.verificationNote` at sync time.
- Listings **removed from the sitemap** on a later sync are marked `availability: unavailable` (no delete).

## Import result (2026-11-23)

| Metric | Value |
|--------|------:|
| Sitemap listings parsed | 25 |
| Postgres upserts (`babes-car-sales-cc`) | 25 |
| Price range | R109,995 – R1,139,995 |
| Failures | 0 |

**Note:** Website shows ~24 consumer-facing units; sitemap includes 25 URLs (index + listings). Two URLs share dealer ref `1319` (different vehicles) — both imported with distinct WordPress post ids.

## Platform changes

| Area | Change |
|------|--------|
| Adapter | `services/inventory/adapters/babesCarSalesAdapter.js` |
| Import CLI | `scripts/import-babes-car-sales-inventory.mjs` |
| Bootstrap | `scripts/bootstrap-babes-bcs03.mjs` (import + Discover + inventory KB) |
| Shared parse | `centralMotorsRtbAdapter.js` — parameterized image host; Babes `(1107)` title prefix |
| Sarah photos | `dealerImageProxy.js` allows `babescarsales.co.za` |
| Discover | Public directory entry for `babes-car-sales-cc` |
| Knowledge | `babes-kn-inventory` — stock from synced inventory only |

## Verification commands

```bash
# Full sync (needs Postgres reachable — Railway tunnel or in-container)
railway run cmd /c "set DATABASE_URL=<tunnel-url>&& node scripts/import-babes-car-sales-inventory.mjs"

# Smoke search
railway run cmd /c "set DATABASE_URL=<tunnel-url>&& node scripts/verify-babes-inventory-smoke.mjs"

# Discover + KB only (no import)
railway run node scripts/bootstrap-babes-bcs03.mjs --skip-import
```

## Demo-ready queries (Sarah / `searchInventory`)

- Automatic SUV under **R250,000** — filtered by price + text (see smoke script output).
- **Toyota Fortuner** — listing `1298-2012-toyota-fortuner-3-0-d-4d-a-t` on file.
- Finance / trade-in — knowledge-driven; no automated valuation tool.

## Central Motors

- No imports into `central-motors-rtb`.
- CM adapter behaviour unchanged for default host; optional `site` / `upsertOptions` for other dealers.

## Spencer — your turn

1. Sarah App → Discover → **Babes Car Sales CC** (or company chat `babes-car-sales-cc`).
2. Try: *“automatic SUV under R250,000”* and *“Do you have a Toyota Fortuner?”*
3. Confirm vehicle **photos** load in Sarah (babescarsales image proxy on deployed API).

## Next — BCS-04

Conversation UAT: finance, trade-in, test-drive booking flows with real `bookTestDrive` / CRM leads.