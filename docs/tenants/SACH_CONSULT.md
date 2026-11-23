# Sach Accounting tenant (`sach-consult`)

| Field | Value |
|-------|--------|
| **companyId** | `sach-consult` |
| **Portal** | [https://app.ziricai.com/?company=sach-consult](https://app.ziricai.com/?company=sach-consult) |
| **Discover / Sarah** | [https://sarah.ziricai.com/#discover/sach-consult](https://sarah.ziricai.com/#discover/sach-consult) |
| **Website** | [https://sachaccounting.co.za](https://sachaccounting.co.za) |
| **Owner login** | `hello@sachaccounting.co.za` (use password reset if needed) |

Provisioned via `scripts/provision-sach-consult-tenant.mjs` (requires Firebase Admin — use `railway run` locally).

Re-bootstrap knowledge only:

```bash
SACH_SKIP_IF_EXISTS=1 railway run node scripts/provision-sach-consult-tenant.mjs
```

**Accounting practice mode** (functional-spec KB + `settings.accountingPractice.enabled`):

```bash
railway run node scripts/bootstrap-sach-accounting.mjs
```

Portal module: **Service requests** (Sarah intake queue). Architecture inventory: `docs/architecture/SACH-01_PHASE0_INVENTORY.md`.