# REC-01 — Sarah Recommendations

**Master Product, Architecture & Commercial Specification**

| Field | Value |
|-------|--------|
| **Organisation** | ZiricAI |
| **Product** | Sarah Recommendations |
| **Programme** | ZiricAI Revenue & Platform Expansion |
| **Specification** | REC-01 |
| **Version** | 1.0 |
| **Status** | **Gates 1–2 approved** (2026-11-19) — [Gate 1](./REC-01_GATE_01_APPROVAL.md) · [Gate 2](./REC-01_GATE_02_APPROVAL.md); **REC-02 authorised**; production pilot/checkout still gated (Gates 5–7) |
| **Launch market** | South Africa |
| **Initial pilot** | Selected verified organisations |
| **Commercial model** | Monthly sponsored recommendation campaigns |

**Related:** [Gate 1](./REC-01_GATE_01_APPROVAL.md) · [Gate 2](./REC-01_GATE_02_APPROVAL.md) · [REC-01b Technical Architecture](./REC-01B_TECHNICAL_ARCHITECTURE.md) · [Repository readiness audit](./REC-01_REPOSITORY_READINESS_AUDIT.md) · [Revenue architecture RS09](./ZIRICAI_REVENUE_ARCHITECTURE.md#7-rs09--sarah-recommendations-sponsored-conversational-discovery) · [Trust & consent](./SARAH_APP_TRUST_AND_CONSENT.md)

---

## Locked product decisions (2026-11-19)

| Decision | Choice |
|----------|--------|
| **Pricing strategy** | Affordable launch pricing; room to increase as network and audience grow |
| **Recommendations billing** | Monthly campaigns with defined **presentation allowances**, usage tracking, spending controls |
| **Launch strategy** | Controlled pilot with selected, verified organisations before wider network |
| **Platform scope** | **Shared platform capability** — not advertising logic owned only by Personal Sarah; eventually Personal Sarah, Company Sarah, and Sarah Network (context-appropriate, permission-bound) |
| **Permanent principle** | Businesses pay for **visibility and consideration**, not for Sarah's endorsement or trust |

Launch prices in this document are **proposed planning tariffs**; validate against pilot performance before permanent publication. VAT presentation TBD.

---

## 1. Executive summary

Sarah Recommendations is a commercial **discovery and referral** capability that enables verified organisations to promote eligible products and services within relevant Sarah conversations.

When a user asks Sarah to recommend a product, service, business, or organisation, Sarah can consult the **Recommendations Engine** to identify suitable options.

The engine evaluates:

- User requirements and preferences
- Geographic relevance
- Organisation verification
- Product or service verification
- Availability and accuracy of information
- Suitability and relevance
- Eligible sponsored campaigns

Sponsored organisations can receive additional visibility when offerings are relevant. **Payment does not guarantee a recommendation.** Sarah remains truthful, suitability-first, transparent about sponsored placements, and committed to the user's interests.

### 1.1 Strategic objectives

- New recurring revenue for ZiricAI
- Connect consumers with verified businesses and offerings
- Give organisations relevant discovery opportunities
- Monetise Sarah's conversational discovery
- Scalable commercial network across industries
- Trusted recommendation ecosystem (not a conventional ad directory)

### 1.2 Core commercial principle

**Businesses pay for visibility and consideration, not for Sarah's endorsement or trust.**

---

## 2. Product positioning

Sarah Recommendations is **contextual discovery and sponsored referral**, triggered by expressed user needs.

### 2.1 Product comparison

| Product | Primary purpose | Placement |
|---------|-----------------|-----------|
| Status Boost (RS03) | Increase post visibility | Status |
| Discover Sponsored Placement (RS04) | Increase listing visibility | Discover |
| **Sarah Recommendations (RS09)** | Eligible visibility in relevant conversations | **Sarah Chats** |

Separate products: independent campaign management, pricing, analytics, billing.

### 2.2 Supported recommendation categories

Configurable category library, including: automotive; retail / e-commerce; education; healthcare; restaurants / food; accommodation; real estate; construction; professional services; financial services; transport; travel; entertainment; home / personal services; technology / telecoms; other approved categories.

Regulated / sensitive categories require extra eligibility rules; may be excluded from sponsored placement.

---

## 3. Product architecture

Recommendations is an **independent platform service** — not advertising logic embedded in Sarah's system prompt.

### 3.1 Core components

- Recommendations API
- Organisation Verification Service
- Offering Verification Service
- Verified Organisation and Offering Catalogue
- Campaign Management Service
- Campaign Budget and Usage Service
- Targeting and Eligibility Engine
- Relevance and Ranking Engine
- Sarah Integration Layer
- Sponsored Disclosure Layer
- Attribution and Analytics Service
- Billing and Revenue Integration
- Administrative Review and Moderation Console (Mission Control)

### 3.2 High-level request flow

1. User asks for a recommendation  
2. Sarah determines request is suitable for Recommendations  
3. Extract category, requirements, location context  
4. Recommendations API receives structured request  
5. Retrieve eligible verified organisations and offerings  
6. Evaluate active campaigns  
7. Ranking: relevance, suitability, sponsorship eligibility  
8. Return ranked shortlist with reasons and sponsorship metadata  
9. Sarah presents results conversationally  
10. Sponsored results disclosed  
11. Record impressions, interactions, enquiries  
12. Update campaign usage and reporting  

### 3.3 Sarah integration surfaces

Eventually: **Personal Sarah**, **Company Sarah**, **Sarah Network** (where consented), future Sarah products.

Each surface respects permissions, identity boundaries, privacy. Consumer personal information must **never** be exposed to an advertiser because they purchased a campaign.

---

## 4. Verification framework

Mandatory before purchasing or activating Recommendations campaigns.

### 4.1 Organisation verification

Legal identity, registration (where applicable), authorised representative, contacts, address, authority to represent, operating status, category, licences, regulatory requirements.

| Status | Meaning |
|--------|---------|
| Pending | Submitted |
| Under Review | In progress |
| Verified | Requirements satisfied |
| Rejected | Not satisfied |
| Suspended | Restricted |
| Expired | Renewal required |

### 4.2 Product and service verification

Per-offering records: name, category, supplier authority, description, documents, price conditions, availability, specs, media, licences, safety / regulatory data. Requirements vary by category (automotive, education, healthcare examples in stakeholder spec).

### 4.3–4.4 Rules

Organisation verification ≠ all offerings verified. Suspended org → offerings ineligible. Support expiry, renewal, complaints, suspension, periodic review.

---

## 5. Campaign management

Created in **Company Portal** by verified organisations.

Workflow: select offering → package → categories → geography → duration → review budget/allowance → terms → payment / approved billing → eligibility review → active.

Key fields: campaign ID, org ID, offering ID, name, category, geography, dates, monthly allowance, used/remaining, budget, status, payment, approval, timestamps.

**Statuses:** Draft, Submitted, Pending Approval, Approved, Scheduled, Active, Paused, Exhausted, Expired, Rejected, Suspended, Cancelled.

Only eligible, approved, **active** campaigns enter sponsored consideration.

---

## 6. Commercial pricing model (Sarah Recommendations — RS09)

**Principles:** affordable launch; small business access; recurring monthly campaigns; scale with audience; protect quality; allowances reflect real delivery; do not oversell capacity.

**Currency:** ZAR (proposed launch). VAT TBD.

### 6.2 Packages

| Package | Monthly (proposed) | Allowance | Target |
|---------|-------------------|-----------|--------|
| **Starter** | R750 | 30 qualified sponsored presentations | Small / independent |
| **Growth** | R1,500 | 75 | Growing local |
| **Professional** | R3,000 | 180 | Established / multi-product |
| **Enterprise** | From R5,000 | Custom | National / multi-location |

Enterprise pricing is commercial agreement; **cannot bypass eligibility or ranking rules.**

### 6.4 Qualified sponsored presentation

Counts only when: eligibility passed; relevant user request; engine selected offering; Sarah **presented** it; disclosure visible; event recorded idempotently.

**Does not consume allowance:** internal searches, unshown results, failed API, failed image load without presentation, ineligible candidates, unrelated conversations, duplicate processing.

### 6.5 Exhaustion

Allowance exhausted → no paid consideration; notify org; organic alternatives continue; renew/upgrade available; **no automatic overage** without explicit billing arrangement. **No rollover by default** (future policy must be explicit).

---

## 7. Discover sponsored placement (RS04)

Independent product — initial proposed packages (planning; align catalogue at REC-04/REC-09):

| Product | Price | Duration |
|---------|-------|----------|
| Discover Boost | R199 | 7 days |
| Discover Featured | R499 | 30 days |
| Discover Premium | R999 | 30 days |
| Discover Enterprise | From R2,499 | 30 days |

Normal business profiles remain available without paid sponsorship.

**Future bundle (not initial pilot):** ZiricAI Business Visibility ~R1,999/mo (Discover Featured + Recommendations Starter + reporting) — only after standalone billing and attribution verified.

---

## 8. Recommendations engine

Distinguish: organic, sponsored, ineligible, unavailable, no suitable results.

### 8.1 Eligibility gates (all mandatory)

Verified org and offering; active org/offering/campaign; remaining allowance; category match; geo match; policy/regulatory rules; no suspension.

### 8.2–8.3 Relevance and ranking

**Relevance-first:** eligibility → request relevance → suitability → geography → freshness → quality → **then** sponsored consideration. Organic may rank above sponsored. Engine may return **no sponsored** result.

### 8.4 No forced advertising

Sarah must not insert ads into unrelated chats, recommend unsuitable paid offerings, present unverified as verified, invent facts, claim “best because sponsored,” or conceal commercial relationship.

---

## 9. Sponsored disclosure and user trust

Labels: Sponsored Recommendation, Sponsored Listing, Paid Placement (surface-appropriate).

Users may ask why, request alternatives, compare, exclude sponsored (where product supports), report inaccuracies.

---

## 10. Geographic targeting and privacy

Country, region, city, town, suburb, service radius, user-supplied location. Minimum precision required.

**Advertisers must not receive:** precise address, private location history, identity from impression alone, conversation content, sensitive personal data.

Reporting is aggregated; identifiable enquiry data only when user initiates contact with consent.

---

## 11. Company Portal — Recommendations module

Sections: Overview; Verification Centre; Offering Catalogue; Campaign Manager; Targeting; Analytics; Billing; Compliance.

---

## 12. Personal Sarah experience (initial consumer integration)

Natural assistance, not a separate ad UI. Clarify needs → retrieve organic + eligible sponsored → disclose → user controls contact. **No identity disclosure to org until user initiates contact/enquiry.**

---

## 13. Attribution and analytics

Event lifecycle (non-exhaustive): `recommendation_request_received`, `candidate_eligible`, `candidate_excluded`, `sponsored_candidate_selected`, `sponsored_presentation_displayed`, `organic_presentation_displayed`, `recommendation_clicked`, `enquiry_started`, `campaign_allowance_consumed`, `campaign_allowance_exhausted`, etc.

Idempotency required. Distinguish impression, click, enquiry, confirmed transaction — never claim a sale from a click alone.

---

## 14. Billing and revenue controls

Monthly campaign billing; payment before activation (unless approved credit); allowance enforcement; PAY-02 boundaries; **separate from consumer subscriptions/credits**. No production payment flag changes as part of REC-01 spec work.

---

## 15. Security, permissions, governance

Tenant isolation; server-side verification and campaigns; RBAC; audit logging; secure documents; anti-manipulation; no self-approval of verification; sensitive category controls.

---

## 16. Mission Control

Queues: org/offering verification, campaign approval, suspensions, expiry, complaints, usage monitoring, billing reconciliation, ranking/presentation audit, platform revenue.

Manual override requires reason + audit; never bypass legal/safety restrictions.

---

## 17. Data and API design (implementation design phase)

Separate entities: verification (org/offering), catalogue, campaigns, budgets, usage, targeting, requests, results, presentation events, attribution, billing, audit.

**Proposed service boundaries** (names indicative — reuse existing platform services where possible):

`recommendationVerificationService`, `recommendationCatalogueService`, `recommendationCampaignService`, `recommendationEligibilityService`, `recommendationRankingService`, `recommendationUsageService`, `recommendationAttributionService`, `recommendationAnalyticsService`, `recommendationBillingService`

API contract must define auth, tenant scope, validation, errors, idempotency, audit.

---

## 18. Pilot launch strategy

**Duration:** 60–90 days. **Sectors:** automotive, education, retail, professional services, accommodation (selected verified orgs).

**Central Motors:** candidate after Sarah presentation-readiness and commercial approval — **no tenant config change solely for pilot.**

**Educare:** consider after EDU operational gates.

**Exit to broad availability:** verification acceptance; server-side eligibility; consistent disclosure; allowance reconciliation; idempotent billing; tenant isolation; privacy tests; no critical manipulation defects; feedback reviewed.

---

## 19. Development roadmap

| Phase | Workstream | Deliverable |
|-------|------------|-------------|
| **REC-01** | Master specification | Product, architecture, commercial requirements |
| REC-02 | Verification | Org + offering verification |
| REC-03 | Catalogue | Verified products and services |
| REC-04 | Campaign management | Packages, targeting, controls |
| REC-05 | Recommendation engine | Eligibility + ranking |
| REC-06 | Sarah integration | Conversational experience |
| REC-07 | Disclosure | Labels + user controls |
| REC-08 | Attribution | Events, analytics, reporting |
| REC-09 | Billing | Monthly payments + usage accounting |
| REC-10 | Pilot | Controlled launch + acceptance |
| REC-11 | Commercial launch | Wider verified availability |

Each phase needs its own technical spec, plan, and acceptance criteria. **UI alone ≠ complete.**

---

## 20. Implementation gates

| Gate | Scope |
|------|--------|
| **1** | Product spec + commercial model + privacy principles agreed |
| **2** | Architecture audit, service boundaries, tenant isolation, data/API contracts |
| **3** | Verification workflows + admin review |
| **4** | Campaign management, allowance enforcement, billing integration |
| **5** | Sarah integration: organic vs sponsored, relevance, disclosure, privacy |
| **6** | Pilot authorisation |
| **7** | Commercial launch approval |

---

## 21. Open decisions (design phase)

Calendar month vs campaign renewal allowance reset; mid-cycle upgrades; rollover; exact UI for “qualified presentation”; per-offering manual approval by category; geo radius defaults; ranking formula; VAT presentation; refunds/credits; top-up allowances; enterprise minimums; retention/aggregation policies.

**Document decisions — do not assume silently.**

---

## 22. REC-01 acceptance principles

Verified-only campaigns and offerings; eligibility + budget controls; relevance over payment; clear disclosure; organic remains; user sovereignty over data; advertiser cannot read private chats; attributable presentations; accurate billing; multi-industry / multi-Sarah scalability.

---

## 23. Final product direction

Sarah Recommendations connects people who need offerings, verified providers, Sarah as assistant, and ZiricAI as verification/campaign/attribution infrastructure.

**Operating principle:** Businesses pay for visibility. They do not pay for Sarah's trust. Sarah's duty remains to the user.

---

**REC-01 specification status:** **GATES 1–2 APPROVED** — begin **REC-02** (verification). Commercial pilot and payments remain behind Gates 5–7 and REC-09/REC-10.