# REC-04 — Campaign management — implementation status

| Field | Value |
|-------|--------|
| **Status** | **MVP complete** (backend) |
| **Tests** | `test/rec-04-campaign.test.mjs` |

## Delivered

- Campaign packages (Starter / Growth / Professional) — planning SKUs in `campaignConstants.js`
- Tenant: create, update (draft), submit, activate, usage read
- Platform: campaign approval queue + approve/reject (audited)
- Usage period bucket (`recCampaignUsagePeriods`) on activation

## Activation rules

- **Payment:** `paymentStatus: paid` required unless company id is in `RECOMMENDATIONS_PILOT_COMPANY_IDS`
- **Engine:** `RECOMMENDATIONS_ENGINE_ENABLED=true` required unless pilot-listed company

## Not in REC-04

- REC-09 checkout / Paystack
- Pause, exhaust, presentation debit (REC-08)
- Portal UI

## Env (pilot)

```bash
RECOMMENDATIONS_PILOT_COMPANY_IDS=educare-christian-combined,central-motors-rtb
RECOMMENDATIONS_ENGINE_ENABLED=false   # pilot tenants may still activate if listed
```