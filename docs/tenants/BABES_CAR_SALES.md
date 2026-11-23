# Babes Car Sales CC (`babes-car-sales-cc`)

| Field | Value |
|-------|--------|
| **companyId** | `babes-car-sales-cc` |
| **Display name** | Babes Car Sales CC |
| **Portal** | `https://app.ziricai.com/?company=babes-car-sales-cc` |
| **Website** | [https://babescarsales.co.za/](https://babescarsales.co.za/) |
| **Industry preset** | `automotive-dealership` v1.0.0 |
| **Owner (default provision)** | `babescarsales43@gmail.com` |

## Provision

```bash
railway run node scripts/provision-babes-car-sales-tenant.mjs
```

Bootstrap only (preset + KB + Sarah), if tenant exists:

```bash
BABES_SKIP_IF_EXISTS=1 railway run node scripts/provision-babes-car-sales-tenant.mjs
```

## Inventory (BCS-03)

```bash
npm run import:babes-inventory
# or full bootstrap (import + Discover + KB):
npm run bootstrap:babes-bcs03
```

Postgres must be reachable (`DATABASE_URL`). From a workstation, use `railway connect postgres --tunnel-only` and override `DATABASE_URL` to `127.0.0.1` (see [BCS-03_IMPLEMENTATION_REPORT.md](../architecture/BCS-03_IMPLEMENTATION_REPORT.md)).

## Sales conversation (BCS-04)

```bash
npm run verify:babes-bcs04
railway run node scripts/bootstrap-babes-bcs04.mjs
```

Tools: `searchInventory`, `checkTestDriveAvailability`, `bookTestDrive`, **`recordSalesEnquiry`** (finance / trade-in CRM handoff).

Report: [BCS-04_IMPLEMENTATION_REPORT.md](../architecture/BCS-04_IMPLEMENTATION_REPORT.md).

## Programme

| Gate | Status |
|------|--------|
| BCS-00 | Audit — [BCS-00_BABES_TENANT_AUTOMOTIVE_AUDIT.md](../architecture/BCS-00_BABES_TENANT_AUTOMOTIVE_AUDIT.md) |
| BCS-02 | Tenant + preset + Sarah foundation — **done** |
| BCS-03 | Sitemap-synced inventory + Discover + inventory KB — **done** |
| BCS-04 | Sales conversation + CRM enquiry tool — **done** (UAT with Spencer) |
| BCS-05 | Presentation readiness |

**Central Motors** (`central-motors-rtb`) is unchanged and is not a data source for this tenant.