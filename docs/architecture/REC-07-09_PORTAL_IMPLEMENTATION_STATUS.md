# REC-07 / REC-09 / Company Portal — implementation status

| Phase | Scope | Status |
|-------|--------|--------|
| **REC-07** | Sarah PWA disclosure cards | **Done** — `recommendationsUi` on chat response; cards in thread |
| **REC-09** | RS09 catalogue + pilot checkout | **Done** — SKUs, checkout start/confirm, `paymentStatus: paid` |
| **Portal** | Offerings + campaigns UI | **Done** — Grow → Sarah Recommendations |

## REC-07 (PWA)

- Backend: `buildRecommendationsUiFromActions` in `personalSarahRecommendationsUi.js`; orchestrator returns `recommendationsUi`.
- Client: `live-bridge.mjs` passes payload; `app.js` renders `rec-disclosure-panel` with sponsored badges and Discover links.

## REC-09 (billing)

- Catalogue: `registerRecCampaignSkus()` in `catalogueService.js` (RS09).
- Service: `billingService.js` — `startRecCampaignCheckout`, `confirmRecCampaignCheckout`, `markCampaignPaid`.
- Routes: `GET/POST …/campaigns/:id/checkout`, `POST …/checkout/confirm`.

### Env (Spencer / Railway)

| Variable | Purpose |
|----------|---------|
| `RS09_REC_CHECKOUT=pilot` | Pilot checkout + portal confirm (no Paystack yet) |
| `RECOMMENDATIONS_CHECKOUT_ENABLED=true` | Treat checkout as commercially active |
| Existing `RECOMMENDATIONS_PILOT_COMPANY_IDS` | Still bypasses payment for **activation** only |

Paystack company checkout remains behind PAY-02.

## Company Portal

- Module: `app/js/portal/modules/recommendations.js`
- Nav: **Grow → Sarah Recommendations** (`canManageNetwork`)
- APIs: `fetchRecOfferings`, campaigns, checkout helpers in `api.js`

Deploy static portal: sync `app/js/portal` → `js/portal` before `prepare-sites` (or commit both).

## Tests

- `test/rec-07-disclosure-ui.test.mjs`
- `test/rec-09-billing.test.mjs`

## Mission Control (REC pilot ops)

- Module: **Sarah Recommendations** in Mission Control (`mcRecommendations`) — offering verification + campaign approval queues.
- Source: `js/admin/modules/mc-recommendations.js` (deploy via `prepare-sites admin`).

## Still open

- REC-08 attribution analytics UI
- REC-10 pilot acceptance checklist (sign-off doc)
- Paystack tenant checkout (production payments)