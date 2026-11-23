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

## Programme

| Gate | Status |
|------|--------|
| BCS-00 | Audit — [BCS-00_BABES_TENANT_AUTOMOTIVE_AUDIT.md](../architecture/BCS-00_BABES_TENANT_AUTOMOTIVE_AUDIT.md) |
| BCS-02 | Tenant + preset + Sarah foundation |
| BCS-03 | Verified inventory + extended knowledge (not website bulk scrape) |
| BCS-04 | Sales conversation UAT |
| BCS-05 | Presentation readiness |

**Central Motors** (`central-motors-rtb`) is unchanged and is not a data source for this tenant.