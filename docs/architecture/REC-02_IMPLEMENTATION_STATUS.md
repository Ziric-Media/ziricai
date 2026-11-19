# REC-02 — Offering verification — implementation status

| Field | Value |
|-------|--------|
| **Status** | **MVP complete** (backend) |
| **Tests** | `test/rec-02-offering-verification.test.mjs` |
| **Feature flag** | `RECOMMENDATIONS_OFFERINGS_ENABLED` (default true); set `false` to disable tenant/MC offering APIs |

## Delivered

- `RECOMMENDATION_COLLECTIONS` in `services/database/schema.js` (offerings + cases; campaign collections reserved)
- `services/recommendations/offeringService.js` — draft CRUD
- `services/recommendations/offeringVerificationService.js` — submit + officer decisions + audit
- `services/api/recommendationRoutes.js` — tenant + `/api/operations/recommendations/verification-queue`
- Route registry + `api/app.js` mount

## Rules enforced

- Organisation must be **SNET-04 verified** before offering verification submit
- Officer **verify** requires checks + note (REC-01 offering verification)
- Verified offering → `status: active`
- MC audit action: `recommendation.offering_verification.*`

## Not in REC-02

- Company Portal UI module
- Evidence file uploads per offering (future)
- Campaigns (REC-04), engine (REC-05), billing (REC-09)

## Next

**REC-03** — portal UX + offering media; **REC-04** — campaigns.