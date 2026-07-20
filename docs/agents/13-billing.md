# 13 — Billing Agent

## Agent Name & Role

Owns subscription plans, tenant billing records, usage limits, and billing UI in portal and admin.

## Phase

**Phase 5 — Integrations**

## Responsibility

- Billing plans definition and limit checks
- Tenant billing/subscription subcollections
- Portal and admin billing modules
- Stripe/Paystack connector activation (via Integration Agent connectors)
- Plan enforcement on resource creation (agents, messages, users)
- Sarah `viewBilling` tool

## Owns

- `services/payments/billingService.js`
- `services/platform/billingPlans.js`
- `services/integrations/connectors/stripeAdapter.js`
- `services/integrations/connectors/paystackAdapter.js`
- `js/portal/modules/billing.js`
- `js/admin/modules/billing.js`
- `js/admin/services/billing.js`
- `services/sarah/tools/viewBilling.js`

## Depends on

- **03 Company Workspace Agent** — plan on company root doc
- **12 Integration Agent** — payment connector execution
- **14 Analytics Agent** — usage metering inputs

## Do NOT touch

- Marketplace pricing display (Marketplace Agent)
- Platform superadmin revenue dashboards (Super Admin Agent)
- Firestore rules for non-billing collections

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Billing Agent. Own plans, tenant billing records, and payment connector wiring.

Audit services/platform/billingPlans.js, services/payments/billingService.js.
Review js/portal/modules/billing.js and connector stubs stripeAdapter.js / paystackAdapter.js.

Tasks:
1. Define plan limits enforced at API level (checkCompanyLimit on agent create, message send).
2. Portal billing module: current plan, usage bars, upgrade CTA.
3. Wire Stripe or Paystack checkout session creation (choose one for MVP).
4. Persist billing + subscription docs under companies/{id}/billing.
5. Sarah viewBilling returns live plan + usage snapshot.

Do NOT modify marketplace catalog pricing or CRM modules.
Return: plan matrix, enforcement points added, payment flow status.
```

## Definition of Done

- [ ] Plans defined with resource limits (agents, messages, users, storage)
- [ ] API enforces limits before create operations
- [ ] Portal shows plan, usage, renewal date
- [ ] At least one payment provider checkout flow works in test mode
- [ ] Webhook handler for payment success updates subscription status
- [ ] Admin billing module shows cross-tenant overview (superadmin)

## Current status

**45% — Partial**

### Already built

- `billingPlans.js` with plan tiers and `checkPlanLimit`
- `billingService.js` tenant repo wrapper
- Portal + admin billing UI modules
- Sarah viewBilling tool
- Schema for billing + subscriptions subcollections
- Connector stubs for Stripe and Paystack

### Remaining work

- **No live payment integration** — connectors are stubs
- Plan limits **not enforced** on API routes
- Usage metering relies on **approximations** in dashboard
- No invoice PDF or billing history UI
- Admin billing may hang on Firestore (noted in admin main.js comments)
