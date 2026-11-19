# REC-01 — Sarah Recommendations — Repository Readiness Audit

**Specification:** [REC-01 Master Spec](./REC-01_SARAH_RECOMMENDATIONS_MASTER_SPEC.md)  
**Audit date:** 2026-11-19  
**Auditor:** Cursor implementation (technical review for Gate 1 → Gate 2)  
**Status:** Read-only; **no REC-02+ code authorised by this document**

---

## 1. Purpose

Map REC-01 requirements to the current `ziricai` codebase, register the new revenue stream, and list gaps before architecture sign-off (Gate 2).

---

## 2. Revenue stream registration

| ID | Name | Market | Model | Spec |
|----|------|--------|-------|------|
| **RS09** | Sarah Recommendations | B2B (buyer); B2C (delivery) | Monthly campaign + presentation allowance | REC-01 §6 |

RS09 is **independent** of RS03 (Status Boost) and RS04 (Discover sponsored). Consumer delivery is conversational (Personal / Company Sarah); purchase and campaign management live in Company Portal + RMS.

**Catalogue today:** `services/revenue/catalogueService.js` seeds RS01, RS02, RS03/04/06–08 placeholders — **no RS09 SKUs yet** (REC-09).

**Discover pricing:** REC-01 §7 proposes Discover Boost/Featured/Premium/Enterprise naming; RMS seed uses `rs04.discover.featured.basic.zar.monthly` (R199). Reconcile naming and durations in REC-04, not in ad-hoc code.

---

## 3. Strategic alignment (existing docs)

| Document | Alignment |
|----------|-----------|
| [ZIRICAI_REVENUE_ARCHITECTURE.md](./ZIRICAI_REVENUE_ARCHITECTURE.md) | RS09 added; RS04 cross-linked to REC-01 Discover packages |
| [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md) | “No pay-to-win Personal Sarah recommendations” — REC-01 engine + disclosure required before monetisation |
| [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md) | RS04 Discover surfaces — separate from RS09 chat placements |
| SNET-04 (`verificationService.js`) | Org verification MVP — partial foundation for REC-02 |
| PAY-02 programme | Campaign checkout must use existing payment gates; **no prod flag changes** during REC-01 |

---

## 4. Platform capability reuse map

| REC-01 component | Existing code / module | Reuse notes | Gap |
|------------------|------------------------|-------------|-----|
| Organisation verification | `services/network/verificationService.js`, `networkIdentityService.js` | SNET-04 states: unverified → verified, MC review, directory denormalisation | **Offering-level** verification, expiry/suspended automation for campaigns not built |
| Discover / directory | `services/users/businessDirectoryService.js`, `networkSearchScoring.js` | Organic search, categories via `networkTaxonomy.js`; scoring explicitly **excludes** sponsored in search | Not a conversation recommendation engine |
| Network profile / listing | `networkProfileService.js`, `networkListingRoutes.js` | Published Discover profiles | No “offering catalogue” entity for REC-03 |
| Personal Sarah discovery | `personalSarahNetworkTools.js` | List Network orgs; delegate to Company Sarah | **Not** REC engine — no campaign, ranking, or presentation metering |
| Company Sarah chat | `companyReceptionChatService.js` | Tenant-scoped inventory/knowledge recommendations | Industry tools ≠ platform RS09 campaigns |
| Revenue / RMS | `catalogueService.js`, `revenueConfig.js`, PAY-02 routes | Ledgers, SKUs, entitlements pattern | No campaign wallet, presentation counters, RS09 billing |
| Attribution / events | `subscriberEventService.js`, network analytics partial | Subscriber events pattern | No REC event schema or idempotent `campaign_allowance_consumed` |
| MC governance | Platform governance routes/modules (in progress) | Queues pattern | No recommendation/campaign approval UI |
| Trust / consent | `SARAH_APP_TRUST_AND_CONSENT.md` | Principles documented | No “exclude sponsored” consumer preference API |

---

## 5. Architecture constraints (non-negotiable from REC-01)

1. **No prompt-only ads** — sponsored candidates must flow through Recommendations API + eligibility engine.
2. **Relevance-first ranking** — sponsored cannot override mandatory suitability (enforce in `recommendationRankingService`, not in LLM prompt).
3. **Qualified presentation metering** — count only on successful user-facing presentation + disclosure + idempotent event.
4. **Tenant isolation** — campaign and verification data scoped by `companyId`; consumers never leak PII to advertisers on impression.
5. **Payment ≠ verification** — existing trust rules remain.
6. **PAY-02 boundary** — RS09 checkout follows same kill-switches and acceptance as RS01–RS04 when implemented.

---

## 6. Proposed service layout (Gate 2 target)

Greenfield under `services/recommendations/` (or `services/revenue/recommendations/`) unless audit finds a better fit:

```
recommendationVerificationService   → extends SNET-04 + offering records
recommendationCatalogueService      → offerings linked to org
recommendationCampaignService       → packages, status, targeting
recommendationEligibilityService    → gate chain §8.1
recommendationRankingService        → §8.2–8.3
recommendationUsageService          → allowance + exhaustion §6.5
recommendationAttributionService    → §13 events
recommendationAnalyticsService      → portal + MC aggregates
recommendationBillingService        → RMS + monthly renewal
recommendationApiRoutes.js          → single entry for Sarah Integration Layer
```

**Sarah Integration Layer:** thin adapters:

- `personalSarahRecommendationAdapter.js`
- `companySarahRecommendationAdapter.js` (future)
- Shared: `POST /api/recommendations/query` (consumer auth, no advertiser data in response)

---

## 7. Gate checklist (current)

| Gate | Requirement | State |
|------|-------------|--------|
| **1 — Product spec** | REC-01 master spec in repo | **Done** (this programme commit) |
| **1 — Commercial model** | Packages, allowances, Discover separation | **Documented** in REC-01 |
| **1 — Privacy principles** | §9–10, trust cross-links | **Documented**; enforcement pending |
| **1 — Stakeholder approval** | Spencer / product sign-off | **Approved** — [REC-01 Gate 1](./REC-01_GATE_01_APPROVAL.md) (2026-11-19) |
| **2 — Architecture audit** | This document + [REC-01b](./REC-01B_TECHNICAL_ARCHITECTURE.md) | **Draft complete** — awaiting Gate 2 sign-off |
| **2 — API contracts** | REC-01b §5 | **Drafted** (route registry update at REC-05) |
| **3–7** | Verification, campaigns, Sarah, pilot, launch | **Not started** |

**Implementation authorisation:** **None** until **Gate 2** architecture approval (Gate 1 **closed** 2026-11-19).

---

## 8. Pilot candidates (no action until Gate 6)

| Organisation | Preconditions |
|--------------|---------------|
| Central Motors | Automotive Sarah readiness; commercial approval; **no config churn for pilot alone** |
| Educare | EDU programme gates; offering verification for school programmes |
| Additional | Verified Discover listings; willing to fund Starter/Growth pilot |

---

## 9. Suggested next steps (after approval)

1. **Gate 1:** Spencer sign-off on REC-01 prices as *pilot planning* tariffs.  
2. **Gate 2:** REC-01b technical spec — entity diagram, Firestore/collections, API list, idempotency keys for presentations.  
3. **REC-02:** Offering verification model + MC queue (build on SNET-04).  
4. **REC-09 stub:** RS09 SKU placeholders in catalogue (inactive / non-purchasable) for UI mocks only.  
5. **Do not** enable checkout or Personal Sarah sponsored UI until Gate 5 acceptance tests pass.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| LLM bypasses engine and “recommends” paid tenants | Tool-only path: `queryRecommendations` with server-side ranking |
| Double-counting presentations on retries | Idempotency key: `conversationId + messageId + offeringId + campaignId` |
| Conflating RS04 Discover slots with RS09 chat | Separate `campaignType` and analytics dashboards |
| Pilot pricing locked too early | Label all SKUs `pilotPlanning: true` until REC-11 |

---

**Audit status:** **COMPLETE for REC-01 establishment** — awaiting Gates 1–2 before REC-02 implementation briefing.