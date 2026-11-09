# ZiricAI — Master Revenue Architecture & Monetisation Specification

**Document:** `ZIRICAI_REVENUE_ARCHITECTURE.md`  
**Version:** 1.0  
**Status:** Strategic direction approved — prices provisional until cost/margin analysis  
**Currency (initial):** ZAR  
**Markets:** B2B (Company Portal) and B2C (Sarah App)

---

## 1. Executive overview

ZiricAI operates a **multi-revenue-stream** model:

- **B2B:** Companies pay for the AI Business OS (Company Portal, AI employees, automation, analytics).
- **B2C:** Individuals use Sarah App (Personal Sarah, Discover, Status, company conversations).
- **Network:** Advertising, sponsored discovery, transactions, and usage-based AI revenue as the ecosystem matures.

**Approved strategic decisions:**

| Decision | Choice |
|----------|--------|
| Consumer subscription tiers | **Four:** Free, Plus, Premium, Ultimate |
| Company advertising | **Both:** Status Boost **and** Discover sponsored placement |
| Revenue architecture scope | **All eight streams** in master architecture; **phased activation** |

**Principles:**

1. Every product has a defined commercial model before scale.
2. Each revenue stream has **independent** billing, entitlements, and reporting.
3. Revenue from consumers and businesses must **not** erode trust (labelling, organic Discover, no pay-for-verification).

Technical translation: [ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md](./ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md)

---

## 2. Revenue stream register

| ID | Stream | Market | Model |
|----|--------|--------|-------|
| **RS01** | Company subscriptions | B2B | Recurring |
| **RS02** | Sarah App subscriptions | B2C | Recurring (freemium) |
| **RS03** | Status promotion (Boost) | B2B | Campaign / budget |
| **RS04** | Discover sponsored placement | B2B | Subscription / campaign |
| **RS05** | Transaction commissions | B2B/B2C | Commission / referral |
| **RS06** | AI credits & additional usage | B2B/B2C | Consumption |
| **RS07** | Premium integrations & add-ons | B2B | Recurring / usage |
| **RS08** | Enterprise implementation & services | B2B | Once-off / contract |

---

## 3. RS01 — Company subscriptions

**Primary B2B recurring revenue.** Subscribers get Company Portal, AI employees, CRM, automation, industry packs, etc.

**Proposed tiers (provisional ZAR/month):**

| Tier | Price (proposal) | Target |
|------|------------------|--------|
| Starter | R499 | Small business |
| Growth | R999 | Growing business |
| Professional | R1,999 | Established |
| Enterprise | R3,999–R10,000+ | Large / multi-site |

*Note: Live catalogue today uses `trial`, `starter`, `professional`, etc. in [billingPlans.js](../../services/platform/billingPlans.js) with different list prices — reconcile before public launch.*

**Differentiation axes:** AI employee count, conversation/token limits, staff seats, storage, workflows, integrations, branches, support SLA, API access.

**Rules:** Subscription entitlements are **separate** from ad spend (RS03/RS04) and transaction fees (RS05). Paying for ads must not be required to operate on a paid company plan.

---

## 4. RS02 — Sarah App consumer subscriptions

**Freemium:** register and use Personal Sarah without payment; paid tiers unlock usage, memory, My Knowledge, models, and workflows.

| Tier | Proposed price | Positioning |
|------|----------------|-------------|
| **Sarah Free** | R0 | Acquisition; fair-use AI limits |
| **Sarah Plus** | R99/mo | Regular personal use |
| **Sarah Premium** | R199/mo | Daily dependence |
| **Sarah Ultimate** | R399/mo | Power users / professionals |

**Free (minimum):** limited daily chats, basic memory, limited My Knowledge, Discover, follow companies, Status feed (organic), basic company Sarah chats.

**Paid unlocks (examples):** higher chat limits, larger My Knowledge, document analysis, reminders/tasks (U2+), extended history, priority processing, eligible premium models.

**Trust:** Subscription does **not** grant access to company private data or other users’ My Knowledge.

**Cost control:** Free tier must be useful but **metered** (model tier + daily caps) to protect gross margin.

---

## 5. RS03 — Status promotion (Boost)

Companies publish Status from Company Portal; **Boost** pays for extended distribution.

| Package | Proposed price | Duration |
|---------|----------------|----------|
| Starter Boost | R50 | 24h |
| Standard Boost | R150 | 3 days |
| Growth Boost | R350 | 7 days |
| Premium Boost | R750 | 14 days |
| Custom | Budget-based | Up to 30 days |

**Targeting (initial):** geo, category/interests, segments, followers/customers — POPIA-compliant, opt-in where required.

**Analytics:** impressions, reach, engagement, clicks, profile visits, enquiries, spend.

**UX:** Sponsored posts **clearly labelled**. Normal Status remains included in company subscription where defined.

---

## 6. RS04 — Discover sponsored placement

**Visibility product** (not the same as Boost):

| Product | Mechanism |
|---------|-----------|
| Featured Business | Prominent category placement |
| Sponsored Search | Paid slots on relevant queries |
| Featured Location | Geo-promoted visibility |

**Proposed monthly packages:**

| Product | Proposed price |
|---------|----------------|
| Featured Basic | R199/mo |
| Featured Plus | R499/mo |
| Featured Premium | R999/mo |
| Sponsored Search | Custom campaign budget |

**Organic protection:** Every **verified** business gets a fair organic listing. Sponsored ≠ verified. Sponsored results **labelled**. Personal Sarah must not rank sponsors only by bid (relevance + user trust rules).

---

## 7. RS05 — Transaction commissions

Earn when ZiricAI **facilitates** an agreed commercial action (booking, purchase, referral) via Sarah Network with **user approval**.

| Category | Initial commission (proposal) |
|----------|-------------------------------|
| Accommodation | 3–8% |
| Restaurants | Fixed or 1–3% |
| Professional services | 2–5% |
| Products | 2–8% |
| Vehicle servicing | Fixed referral |
| Food orders | 3–8% |

**Workflow:** request → Personal/Company Sarah → quote → **explicit user approve** → payment/booking → commission record → settlement.

Use payment partners (Stripe, Paystack, etc.); ZiricAI is not required to become a bank on day one.

---

## 8. RS06 — AI credits & additional usage

Subscriptions include allowances; **credit packs** cover heavy operations (large docs, advanced reasoning, agent runs).

**Consumer packs (proposal):**

| Credits | Price |
|---------|-------|
| 100 | R29 |
| 500 | R99 |
| 1,500 | R249 |
| 5,000 | R699 |

**Rules:** Show estimated cost before deducting; separate “included allowance” vs “purchased credits”; atomic ledger entries.

---

## 9. RS07 — Premium integrations & add-ons

Monetise beyond base tier: WhatsApp add-on, advanced CRM/analytics, accounting connectors, extra AI employees, storage, API usage, automation packs.

**Billing:** monthly, annual, usage-based, or one-time activation — **never double-charge** for features already in the subscription tier.

---

## 10. RS08 — Enterprise services

Implementation, migration, custom workflows, training, dedicated support, custom integrations.

| Service | Proposed price |
|---------|----------------|
| Standard onboarding | R2,500 |
| Advanced implementation | R10,000 |
| Enterprise implementation | R50,000+ |
| Custom integrations | Quoted |
| Dedicated support | Contract |

---

## 11. Central revenue management (conceptual)

Shared platform service (not duplicated in Sarah App vs Company Portal):

| Component | Role |
|-----------|------|
| Product & pricing catalogue | All SKUs (plans, boosts, featured, credits) |
| Subscription management | B2B + B2C renewals |
| Entitlement engine | Feature flags, limits, model access |
| Usage metering | AI tokens, messages, storage |
| Advertising wallet & campaigns | RS03 + RS04 budgets |
| Transaction commission engine | RS05 |
| Payment integration | Stripe/Paystack/etc. |
| Billing & invoicing | VAT, receipts, refunds |
| Revenue ledger | Immutable audit trail |
| Revenue analytics | MC dashboard |

**Separation:** Payment success must not auto-grant unrelated entitlements (e.g. ad payment ≠ Premium Sarah).

**Advertising wallet (recommended):** Company pre-funds wallet; campaigns draw down with per-campaign reporting.

**Gross margin control:** Unit economics per company tier and Sarah tier (AI cost vs price).

---

## 12. Product ownership map

| Surface | Revenue streams |
|---------|-----------------|
| **Company Portal** | RS01, RS03, RS04, RS07, RS08 |
| **Sarah App** | RS02, RS05 (consumer side), RS06 |
| **Status & Discover (Sarah App UX, company publish in portal)** | RS03, RS04 delivery |
| **Mission Control** | Pricing admin, revenue KPIs, moderation, fraud |

---

## 13. Trust & compliance (monetisation)

- Sponsored content labelled; ad preferences for consumers.
- No selling personal data; My Knowledge disclosure remains user-controlled ([SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md)).
- POPIA-aware targeting and consent records for ads.
- Paying advertisers do not receive “verified” badge automatically.
- Personal Sarah recommendations are not **pay-to-win**; sponsored Discover is explicit slots only.

---

## 14. Implementation phases

Two timelines apply: **architecture readiness** (design all eight streams into RMS) vs **commercial activation** (when we actually charge).

| Stream | Architecture | Commercial activation |
|--------|--------------|------------------------|
| RS01 Company subscriptions | Phase 1 | Phase 1 (payments validated) |
| RS02 Sarah subscriptions | Phase 1 | After consumer usage + COGS validation |
| RS03 Status Boost | Phase 1 | When Status is operational (U7) |
| RS04 Discover sponsored | Phase 1 | When Discover is operational (U6) |
| RS05 Commissions | Phase 1 design | Phase 2 |
| RS06 AI credits | Phase 1 design | Phase 2 |
| RS07 Add-ons | Phase 1 design | Phase 2 |
| RS08 Enterprise services | Phase 1 design | Phase 3 |

**Phase 1 (architecture):** Central catalogue, ledger, entitlements, flags, payment adapter stubs — RS01–RS04 schema and hooks; RS05–RS08 types in catalogue/ledger only.

**Phase 2 (ecosystem activation):** RS05, RS06, RS07 when Sarah Network, metering, and add-on products are mature.

**Phase 3 (enterprise):** RS08 + marketplace/API/white-label (future extensions).

**Do not** block Sarah App product work on full billing; **do** design entitlement hooks and route all monetisation through the Revenue Management System ([implementation spec](./ZIRICAI_REVENUE_MANAGEMENT_IMPLEMENTATION_SPEC.md)).

---

## 15. Illustrative scenarios (not forecasts)

Combined monthly illustration (~R100M) shows **consumer subscriptions** can exceed **company subscriptions** at scale — diversification is the strategic goal.

All public pricing requires: payment fees, VAT, refunds, AI COGS, and pilot conversion data.

---

## 16. Acceptance criteria (architecture ready for build planning)

- Eight streams registered with product IDs and billing rules.
- B2B vs B2C subscriptions separated.
- Entitlement engine covers company + consumer accounts.
- Metering supports credits and plan limits.
- Ad campaigns have budgets, targeting, analytics, labelling.
- Commission engine supports configurable rates and reconciliation.
- MC revenue dashboard spec aligned with Section 16 KPIs in stakeholder doc.
- No disruption to existing tenant billing records during migration.

---

## 17. Related documents

- [ZIRICAI_REVENUE_MANAGEMENT_IMPLEMENTATION_SPEC.md](./ZIRICAI_REVENUE_MANAGEMENT_IMPLEMENTATION_SPEC.md) — **RMS build specification (R0 gate)**  
- [ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md](./ZIRICAI_REVENUE_SYSTEM_ARCHITECTURE.md) — technical mapping & codebase audit  
- [SARAH_APP_MASTER_ARCHITECTURE.md](./SARAH_APP_MASTER_ARCHITECTURE.md) — consumer product boundaries  
- [MARKETPLACE.md](./MARKETPLACE.md) — packs (future RS extension)
