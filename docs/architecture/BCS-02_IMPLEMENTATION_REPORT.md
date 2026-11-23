# BCS-02 — Babes Car Sales: implementation report

**Date:** 2026-11-23  
**Status:** **Complete** (tenant provisioned; no inventory; Central Motors untouched)

---

## 1. Duplicate check (pre-provision)

- Firestore `listAllCompaniesFromStorage()`: **no** Babes / babescarsales matches before create.
- Target id **`babes-car-sales-cc`** validated against `operatorTenantProvisionService` reserved-id rules (not Central Motors namespace).

## 2. Tenant created

| Field | Value |
|-------|--------|
| **companyId** | `babes-car-sales-cc` |
| **Name** | Babes Car Sales CC |
| **Industry** | Automotive |
| **Website** | https://babescarsales.co.za/ |
| **Phone** | 014 594 2985 |
| **Email** | babescarsales43@gmail.com |
| **Owner portal login** | `babescarsales43@gmail.com` (Michelle as display owner name) |
| **Portal** | https://app.ziricai.com/?company=babes-car-sales-cc |
| **WhatsApp** | Ready for Setup (no number assigned; no CM credentials) |

Provisioning path: `provisionOperatorTenant` → `provisionCompany` (Sarah AI employee, KB, CRM baseline per platform defaults).

## 3. Automotive preset activation

Activated via existing `updateCompany` fields (same mechanism as Central Motors ops — **no** new `applyAutomotiveDealershipPreset` framework):

| Field | Value |
|-------|--------|
| `industryPresetId` | `automotive-dealership` |
| `industryPresetVersion` | `1.0.0` |
| `industryPresetActivatedAt` | 2026-11-23 (provision run) |

`isAutomotivePresetConfigured(company)` → **true** after bootstrap.

## 4. Company Sarah configuration

| Item | Detail |
|------|--------|
| Default agent | Sales consultant Sarah — Babes-specific system prompt + greeting |
| Knowledge | 4 docs: hours, location, services (finance/trade-in routing), Michelle & Omar team |
| Inventory tools | **Not populated** — `searchInventory` will return empty until BCS-03 |

Code: `services/automotive/babesCarSalesBootstrap.js`  
Script: `scripts/provision-babes-car-sales-tenant.mjs`

## 5. Isolation verification

| Check | Result |
|-------|--------|
| `central-motors-rtb` preset | Still `automotive-dealership` (unchanged) |
| Babes id ≠ CM id | Confirmed |
| CM inventory / WhatsApp | Not copied |
| Babes WhatsApp | New ready-for-setup record only |

## 6. Explicitly not done (per gate scope)

- No vehicle import from website (24 listings).
- No Sarah Network Discover publish (optional later).
- No WhatsApp Meta assignment.
- No Railway/API deploy required for Firestore tenant data (optional deploy carries dev WhatsApp prompt fallback for `babes-car-sales-cc`).

## 7. Platform note (future)

`activateAutomotiveDealershipPreset()` lives in `babesCarSalesBootstrap.js` as a **small helper** for this tenant; can be promoted to a shared automotive provisioning module after a second dealership onboard — not required for Babes correctness.

## 8. Spencer — your turn

1. Sign in to **app portal** as `babescarsales43@gmail.com` using the **temporary password or password reset link** from the provision run (share once, then reset).
2. Confirm **Automotive command centre** loads (preset-gated; KPIs may be empty without stock).
3. Open **Company Sarah** — greeting should reference Babes; finance/trade-in answers should cite KB routing to Michelle/Omar.
4. Confirm **vehicle search** is empty until BCS-03 (expected).

## 9. Next gate — BCS-03

- Agree inventory source + curated demo stock (verified availability).
- Optional: Babes website adapter (new file, not CM adapter).
- Discover listing when presentation requires Sarah App discover card.