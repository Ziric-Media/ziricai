# ZiricAI — Revenue Management Implementation Readiness

**Audit date:** 2026-11-04  
**Commercial activation:** **NOT PERMITTED** (R0 only)

**Documents:**

- [ZIRICAI_REVENUE_ARCHITECTURE.md](./ZIRICAI_REVENUE_ARCHITECTURE.md)  
- [ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md](./ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md)  
- [ZIRICAI_REVENUE_MANAGEMENT_IMPLEMENTATION_SPEC.md](./ZIRICAI_REVENUE_MANAGEMENT_IMPLEMENTATION_SPEC.md)

---

## 1. Documented architecture vs implemented (R0)

| Capability | Spec | Implemented (local workspace) | Production |
|------------|------|-------------------------------|------------|
| Product catalogue (RS01–08 SKUs) | ✅ | `services/revenue/catalogueService.js` | ❓ Uncommitted / undeployed |
| Legacy plan aliases | ✅ | `legacyPlanAliases.js` | — |
| Entitlement engine (shadow) | ✅ | `entitlementEngine.js` | — |
| Consumer Free tier snapshot | ✅ | Bootstrap/profile responses | — |
| Company entitlements | ✅ | Via tenant billing + catalogue | Existing tenant billing |
| Revenue ledger | ✅ | `ledgerService.js` (**in-memory**) | — |
| commercialActivation flags | ✅ All **false** | `revenueConfig.js` | — |
| Public catalogue API | ✅ | `GET /api/revenue/catalogue/public` | — |
| MC revenue APIs | ✅ | `/api/platform/revenue/*` | — |
| Payment adapter | Spec R1 | **None** | — |
| Firestore `platform/pricingCatalog` | Spec R0 | **Not implemented** | — |
| Ad wallet / campaigns | Spec R1b | **None** | — |
| Commission engine RS05 | Spec R2 | **None** | — |

**Gap summary:** R0 is a **code skeleton** aligned with spec; **not production-grade persistence** or payments.

---

## 2. Existing billing infrastructure (reuse)

| Asset | Location | Maturity |
|-------|----------|----------|
| Company plans | `services/platform/billingPlans.js` | Medium — prices differ from RS01 proposal doc |
| Tenant billing record | `services/payments/billingService.js` | Medium |
| Plan limits | `checkPlanLimit`, `aiEmployeeEntitlement.js` | Partial enforcement |
| Portal billing UI | `js/portal/modules/billing.js` | Medium |
| MC billing console | `viewPlatformBillingConsole` | Tenant plans only |
| Payment provider webhooks | — | **Not verified** for subscriptions |

Sarah **consumer** billing: **none** beyond R0 entitlements.

---

## 3. R0 verification (audit run)

| Test | Result |
|------|--------|
| `test/revenue-r0.test.mjs` | **PASS** (2026-11-04) |

Confirmed:

- Public Sarah Free SKU exists  
- `commercialActivation.rs02SarahCheckout === false`  
- Ledger idempotency  
- Legacy starter plan alias maps to catalogue  

---

## 4. Commercial activation guardrails

| Guard | Evidence |
|-------|----------|
| Default flags off | `revenueConfig.js` DEFAULT_CONFIG |
| Env kill switch | `REVENUE_COMMERCIAL_OVERRIDE=disabled` |
| No checkout routes | No Stripe/Paystack subscription endpoints in consumer API |
| Spec separation billing ≠ entitlements | Implementation spec §4 |

**Audit finding:** No new commercial charges are activated in codebase defaults.

---

## 5. Path to R1 / R1b / R2 / R3

| Phase | Prerequisites | Deliverables |
|-------|---------------|--------------|
| **R0 prod** | Gate 2; commit + deploy | Firestore catalogue + ledger; MC publish draft; entitlement shadow metrics |
| **R1 RS01** | Payment credentials; U0; dual-write checklist §9.2 in impl spec | Company checkout, dunning, MC dashboard v1 |
| **R1 RS02** | Consumer usage/COGS validation; U5 traffic data | Checkout plumbing; paywall **flag still off** until approval |
| **R1b RS03/RS04** | **U7 Status**, **U6 Discover** ad surfaces | Ad wallet, campaigns, labelled injection |
| **R2 RS05–RS07** | Sarah Network transactions; metering | Commissions, credits, add-on SKUs |
| **R3 RS08** | Enterprise sales process | Quotes, contracts, services catalogue |

**Stakeholder rule (confirmed):** Revenue **architecture** may continue in parallel with product; **activation** only when product + payment gates pass (Gate 6).

---

## 6. RS01 pricing reconciliation

| Source | Starter price (example) |
|--------|-------------------------|
| Revenue architecture doc | R499 proposal |
| `billingPlans.js` live | R999.99 |

**Decision required** before RS01 public launch (margin analysis).

---

## 7. Integration with U6/U7

| Stream | Product dependency |
|--------|-------------------|
| RS03 Status Boost | U7 feed + campaign UI |
| RS04 Discover sponsored | U6 directory + profile |
| RS02 Sarah tiers | Personal Sarah metering hooks (shadow today) |

Specs cross-link in [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md) and revenue impl spec §14.

---

## 8. Readiness verdict

| Question | Answer |
|----------|--------|
| Architecture complete enough to implement? | **Yes** |
| R0 complete for production? | **No** — persistence + deploy + commit |
| Safe to activate revenue now? | **No** |
| Blockers for R1 | Git/deploy, payment adapter, U0 sign-off, pricing reconciliation |

---

## 9. Gate 6 checklist (preview)

| # | Criterion |
|---|-----------|
| G6-1 | RS01 pilot tenant billing successful in staging |
| G6-2 | RS02 COGS model approved |
| G6-3 | RS03/RS04 product surfaces live (U7/U6) |
| G6-4 | Legal terms for ads and subscriptions |
| G6-5 | `commercialActivation` toggled only by MC with audit log |
