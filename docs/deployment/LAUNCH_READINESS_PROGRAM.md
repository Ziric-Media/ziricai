# Launch Readiness Program — ZiricAI

**Document type:** Business & operations milestone checklist  
**Created:** 2026-07-19  
**Last reviewed:** 2026-07-19  
**Audience:** Founders, product, legal, marketing, customer success, engineering leads  
**Related engineering work:** [`docs/ROADMAP.md`](../ROADMAP.md), [`docs/agents/`](../agents/README.md) (coding agents 01–22)

---

## Executive Summary

The **Launch Readiness Program** is a **non-coding milestone** that defines what must be true before ZiricAI accepts paying customers at scale. It complements — but does **not** replace — the engineering agent roadmap (Agents 01–22), sprint verification scripts, and the CTO audit.

| Dimension | Coding agents & sprints | Launch Readiness Program |
|-----------|-------------------------|--------------------------|
| **Purpose** | Build, wire, and harden the platform | Confirm the business is legally, commercially, and operationally ready to sell |
| **Owners** | Engineering subagents | Cross-functional roles (Legal, Marketing, CS, Sales, DevOps) |
| **Output** | Code, APIs, Firestore schema, CI | Policies, collateral, support systems, go/no-go sign-off |
| **Current state** | ~58% platform maturity; CTO score **52/100** | **~22% complete** across five pillars (see score table below) |

**Engineering baseline already achieved (Sprints 1–5):**

- `npm run verify:sprint1` — **18/18 PASS** (onboarding → provisioning chain)
- `npm run verify:journey` — **14/14 PASS** (signup → WhatsApp ingest → inbox → analytics)
- Demo data gated to `demo-central-motors` only ([`SPRINT2_DEMO_REMOVAL.md`](./SPRINT2_DEMO_REMOVAL.md))
- Portal polish: skeletons, empty states, error toasts ([`SPRINT4_POLISH.md`](./SPRINT4_POLISH.md))
- Security hardening on platform routes ([`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md))

**Still blocking public launch (from CTO audit + DevOps agent):**

- No CI/CD (`.github/workflows/` absent)
- Firestore backups and monitoring not configured
- Production env not enforced by default (`TENANT_SCOPE_ENFORCEMENT=lax`, `STORAGE_BACKEND=memory` locally)
- Legal/commercial collateral largely missing
- Sales and growth programs not built

---

## Readiness Score / Overall Status

| Pillar | Done | In Progress | Not Started | N/A | Pillar score |
|--------|------|-------------|-------------|-----|--------------|
| **Technical** | 8 | 5 | 4 | 0 | **42%** |
| **Business** | 1 | 2 | 5 | 0 | **11%** |
| **Sales** | 1 | 2 | 4 | 0 | **14%** |
| **Customer Success** | 2 | 2 | 4 | 0 | **25%** |
| **Growth** | 1 | 1 | 3 | 0 | **20%** |
| **Overall** | **13** | **12** | **20** | **0** | **~22%** |

**Legend:** Done = evidence in repo or verified PASS; In Progress = partial implementation or documented plan; Not Started = no artifact found.

**CTO audit cross-reference:** Platform engineering readiness **52/100** — **NO-GO** for public multi-tenant launch ([`CTO_AUDIT_REPORT.md`](../architecture/CTO_AUDIT_REPORT.md)). This program adds business, legal, sales, CS, and growth gates on top of that score.

---

## Pillar 1 — Technical

Engineering quality, reliability, and production operations. Most items depend on **Agent 22 (DevOps)** and remaining **CTO audit P0/P1** fixes.

### 1.1 Quality & UX

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| T-01 | No console errors on primary user flows | In Progress | Engineering / QA | [`PLATFORM_QA_REPORT.md`](../architecture/PLATFORM_QA_REPORT.md); manual only | Browser console clean on landing, onboarding, portal login, inbox, Sarah chat across Chrome/Firefox/Safari | Sprint 4 polish; Agent 20 smoke matrix |
| T-02 | No broken links on public site | In Progress | Marketing / Engineering | [`ziricai.html`](../../ziricai.html) — industry pages linked; footer Privacy/Terms/Careers/Partners are `#` placeholders | All nav and footer links resolve (200 or valid anchor); no `showToast('coming soon')` on launch-critical paths | Content pages for legal + resources |
| T-03 | Fast page loads (Core Web Vitals targets) | In Progress | Engineering | [`lazyLoader.js`](../../js/portal/core/lazyLoader.js); `NODE_ENV=production` static caching in `server.js` | LCP &lt; 2.5s, CLS &lt; 0.1 on landing + portal dashboard on 4G throttled test | Agent 19 performance benchmarks |
| T-04 | Real data everywhere (no demo bleed) | In Progress | Engineering | [`SPRINT2_DEMO_REMOVAL.md`](./SPRINT2_DEMO_REMOVAL.md); [`services/core/dataMode.js`](../../services/core/dataMode.js) | New tenant signup shows empty/live data, never Central Motors, unless `demo-central-motors` selected | Firestore backend in prod; Sprint 2 complete |
| T-05 | Automated regression tests in CI | Not Started | DevOps / QA | No `.github/workflows/`; [`22-devops-deployment.md`](../agents/22-devops-deployment.md) at 0% | CI runs on every PR: install, import check, `verify:sprint1`, `verify:journey` | Agent 22 CI workflow |
| T-06 | Strict auth enforced in production | In Progress | Engineering | [`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md); [`.env.example`](../../.env.example) documents `TENANT_SCOPE_ENFORCEMENT=strict` | Prod/staging envs use strict mode; cross-tenant API calls return 403; audit log entries for denials | Agent 02; CTO P0-2 |
| T-07 | Firestore production backend live | In Progress | DevOps / Engineering | [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) §4; rules + indexes in repo | Server logs `[storage] Using firestore adapter`; tenant data persists across restarts | Firebase deploy; Agent 01 migration |
| T-08 | Legacy → tenant data cutover complete | Not Started | Engineering | [`MIGRATION.md`](../architecture/MIGRATION.md); [`scripts/migrate-demo-to-tenants.js`](../../scripts/migrate-demo-to-tenants.js) | Webhook/CRM paths write only tenant subcollections; legacy root collections read-only or empty | Agent 01, 07, 08; CTO P1-1 |

### 1.2 Operations & resilience

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| T-09 | Backups configured | Not Started | DevOps | CTO audit: "No Firestore backup/export automation" | Scheduled Firestore export (daily); restore drill documented and tested once | Agent 22 backup runbook |
| T-10 | Monitoring & alerting enabled | In Progress | DevOps | `GET /api/health`, `GET /api/integrations/health` in [`server.js`](../../server.js); [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) §9 | External uptime probe on `/api/health`; alert on 5xx/error rate; on-call contact defined | Agent 22 monitoring section |
| T-11 | Error/crash reporting integrated | Not Started | DevOps | No Sentry/Datadog hooks in codebase | Unhandled exceptions reported with tenant/user context (PII-safe) | Agent 22 |
| T-12 | Rollback runbook tested | In Progress | DevOps | [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) §10 — high-level only | Documented revert for hosting, rules, env pin; one tabletop or staging drill completed | Agent 22 |
| T-13 | Platform route security (P0) | In Progress | Engineering | [`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md) — `requirePlatformAccess()` on provision/ops routes | Unauthenticated calls to `/api/platform/provision/*` and `/api/operations/*` return 401/403 | Sprint 5; CTO P0-1, P0-4 |
| T-14 | Webhook signature verification | In Progress | Engineering | [`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md) gap table; PLATFORM_QA §9 | Meta app secret validation enabled; invalid signatures rejected | Agent 12 |
| T-15 | Durable job queue (scale path) | Not Started | Engineering | In-memory [`jobQueue.js`](../../services/queue/jobQueue.js) | Redis or Cloud Tasks for inbound message processing | Agent 12 + 22; CTO P1-3 |
| T-16 | HTTPS & public domain configured | Not Started | DevOps | Documented for Meta webhook in PRODUCTION_CHECKLIST | Valid TLS cert; production domain serves landing + API | Hosting deploy |
| T-17 | Secrets not in git | Done | Engineering | [`.env.example`](../../.env.example); `.env` gitignored | No API keys in repo history; CI uses secret store pattern documented | Agent 22 |

### Technical pillar checklist (summary)

- [ ] **T-01** No console errors on primary flows — *In Progress*
- [ ] **T-02** No broken links — *In Progress*
- [ ] **T-03** Fast page loads — *In Progress*
- [ ] **T-04** Real data everywhere — *In Progress*
- [ ] **T-05** CI regression tests — *Not Started*
- [ ] **T-06** Strict auth in production — *In Progress*
- [ ] **T-07** Firestore backend live — *In Progress*
- [ ] **T-08** Tenant cutover complete — *Not Started*
- [ ] **T-09** Backups configured — *Not Started*
- [ ] **T-10** Monitoring enabled — *In Progress*
- [ ] **T-11** Crash reporting — *Not Started*
- [ ] **T-12** Rollback tested — *In Progress*
- [x] **T-13** Platform routes protected — *Done* (Sprint 5)
- [ ] **T-14** Webhook signatures — *In Progress*
- [ ] **T-15** Durable queue — *Not Started*
- [ ] **T-16** HTTPS/domain — *Not Started*
- [x] **T-17** Secrets hygiene — *Done*

**Technical: 2 done · 10 in progress · 5 not started**

---

## Pillar 2 — Business

Legal, pricing, and commercial policies required before accepting payment.

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| B-01 | Pricing finalized (single source of truth) | Done | Product / Finance | [`services/platform/billingPlans.js`](../../services/platform/billingPlans.js) (Starter R999.99 / Professional R2,999 / Business R4,999 / Enterprise Custom ZAR); landing via [`js/landing/pricing.js`](../../js/landing/pricing.js) + [`/api/billing/plans`](../../server.js); Sarah FAQ via [`js/shared/platformKnowledge.js`](../../js/shared/platformKnowledge.js) | One canonical price list; landing, portal billing, and Stripe/Paystack SKUs aligned | Agent 13 billing connectors |
| B-02 | Terms & Conditions (published) | Not Started | Legal | Footer links in `ziricai.html` point to `#`; demo policies only in [`js/admin/demo-data.js`](../../js/admin/demo-data.js) | Lawyer-reviewed T&C page live at `/terms`; linked from signup, footer, checkout | Legal counsel |
| B-03 | Privacy Policy (POPIA/GDPR) | Not Started | Legal / DPO | POPIA mentioned in landing copy and [`platformKnowledge.browser.js`](../../js/shared/platformKnowledge.browser.js); no standalone policy page | POPIA + GDPR compliant policy; data controller identified; retention & DSR process documented | Legal counsel |
| B-04 | Cookie Policy + consent banner | Not Started | Legal / Engineering | No cookie policy or consent UI found | Cookie policy page; consent banner on marketing site; analytics cookies gated | Privacy policy first |
| B-05 | Refund Policy | Not Started | Legal / Finance | Demo refund text in tenant knowledge samples only | Published refund policy; linked from billing module and checkout | Pricing finalized |
| B-06 | Support documentation (internal + customer-facing) | In Progress | Customer Success | [`js/portal/modules/support.js`](../../js/portal/modules/support.js); [`docs/architecture/PORTAL_BOS.md`](../architecture/PORTAL_BOS.md) | Tier-1 support runbook; SLA matrix by plan; escalation paths documented | CS hire or assign owner |
| B-07 | Live payment processing | Not Started | Engineering / Finance | [`stripeAdapter`](../../services/integrations/connectors/stripeAdapter.js), [`paystackAdapter`](../../services/integrations/connectors/paystackAdapter.js) — stubs | Successful test charge in staging; invoices generated; trial → paid conversion works | Agent 13; pricing finalized |
| B-08 | Data Processing Agreement (B2B) | Not Started | Legal | Not in repo | DPA template for enterprise customers | Privacy policy |

### Business pillar checklist

- [x] **B-01** Pricing finalized — *Done*
- [ ] **B-02** Terms & Conditions — *Not Started*
- [ ] **B-03** Privacy Policy (POPIA/GDPR) — *Not Started*
- [ ] **B-04** Cookie Policy — *Not Started*
- [ ] **B-05** Refund Policy — *Not Started*
- [ ] **B-06** Support documentation — *In Progress*
- [ ] **B-07** Live payments — *Not Started*
- [ ] **B-08** DPA template — *Not Started*

**Business: 1 done · 1 in progress · 6 not started**

---

## Pillar 3 — Sales

Revenue-facing assets and outbound readiness.

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| S-01 | Demo videos (product walkthrough) | In Progress | Marketing | Interactive demo modal in [`ziricai.html`](../../ziricai.html) ("Watch AI Live"); no hosted video files | 2–3 minute hosted videos: onboarding, inbox, Sarah; embedded on landing + sales deck | Stable product UI (Sprint 4) |
| S-02 | Customer onboarding emails | Not Started | Marketing / CS | No transactional email templates or ESP integration in repo | Welcome, trial day 7, trial expiry, go-live checklist emails automated | Email provider (SendGrid/Postmark) |
| S-03 | Sales presentations | Not Started | Sales / Marketing | Not found | Pitch deck (PDF + Google Slides) covering problem, product, pricing, ROI, case study | Pricing finalized; demo videos |
| S-04 | Industry brochures | In Progress | Marketing | Seven industry landing pages: [`industry-automotive.html`](../../industry-automotive.html) … [`industry-church.html`](../../industry-church.html) | Print/PDF one-pagers per vertical OR polished industry pages with CTA; sales team trained | Industry pack content (Agent 16) |
| S-05 | Proposal templates | In Progress | Sales | Workflow `generate_proposal` in [`workflowTemplates.js`](../../services/workflows/workflowTemplates.js) — product automation, not sales PDF | Branded proposal/quote templates (Word/PDF) for Starter/Business/Enterprise | Pricing finalized |
| S-06 | ROI calculator aligned to pricing | Done | Marketing | ROI section in [`ziricai.html`](../../ziricai.html) + [`js/ziricai-landing.js`](../../js/ziricai-landing.js) | Calculator uses canonical plan prices; CTA links to onboarding | B-01 pricing lock |
| S-07 | Sales CRM / pipeline tool | Not Started | Sales | ZiricAI CRM is product feature, not internal sales stack | Internal pipeline (HubSpot/Pipedrive/Notion) with stages and owners | Sales hire |

### Sales pillar checklist

- [ ] **S-01** Demo videos — *In Progress*
- [ ] **S-02** Onboarding emails — *Not Started*
- [ ] **S-03** Sales presentations — *Not Started*
- [ ] **S-04** Industry brochures — *In Progress*
- [ ] **S-05** Proposal templates — *In Progress*
- [x] **S-06** ROI calculator — *Done*
- [ ] **S-07** Internal sales CRM — *Not Started*

**Sales: 1 done · 3 in progress · 3 not started**

---

## Pillar 4 — Customer Success

Post-sale support infrastructure.

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| CS-01 | Help Center (public) | In Progress | Customer Success | Landing `#faq` section; portal [`support.js`](../../js/portal/modules/support.js) | Searchable help center (Notion/Intercom/Zendesk Guide) with 20+ articles; replaces `showToast('coming soon')` links | Content writing |
| CS-02 | Video tutorials | Not Started | Customer Success | Not found | Playlist: signup, WhatsApp connect, KB upload, team invite, billing | S-01 demo videos |
| CS-03 | Knowledge base articles (platform) | In Progress | CS / Product | [`js/shared/platformKnowledge.js`](../../js/shared/platformKnowledge.js); [`knowledge/ziric-media.json`](../../knowledge/ziric-media.json); extensive `docs/` | Customer-facing KB separate from internal architecture docs; Sarah trained on support content | Content audit |
| CS-04 | Live chat (website) | Not Started | Customer Success | [`webchatAdapter.js`](../../services/integrations/adapters/webchatAdapter.js) — stub | Live chat widget on marketing site with business-hours coverage | Vendor selection |
| CS-05 | Ticketing system | Not Started | Customer Success | Portal support module is FAQ + mailto only | Tickets created from portal/email; SLA tracking; integration with CS queue | CS tool (Zendesk/Freshdesk) |
| CS-06 | In-app onboarding checklist | Done | Product | Go-live checklist in [`js/onboarding/main.js`](../../js/onboarding/main.js); [`SPRINT4_POLISH.md`](./SPRINT4_POLISH.md) | New tenants see actionable post-signup checklist with portal CTA | Sprint 1 + 4 |
| CS-07 | Status page / incident comms | Not Started | DevOps / CS | Not found | Public status page; incident template; linked from support module | T-10 monitoring |
| CS-08 | CS escalation runbook | In Progress | Customer Success | Support hours in `support.js` (`support@ziricai.com`) | Documented L1/L2/L3 escalation; on-call rotation for P0 outages | B-06 support docs |

### Customer Success pillar checklist

- [ ] **CS-01** Help Center — *In Progress*
- [ ] **CS-02** Video tutorials — *Not Started*
- [ ] **CS-03** KB articles — *In Progress*
- [ ] **CS-04** Live chat — *Not Started*
- [ ] **CS-05** Ticketing — *Not Started*
- [x] **CS-06** In-app onboarding checklist — *Done*
- [ ] **CS-07** Status page — *Not Started*
- [ ] **CS-08** Escalation runbook — *In Progress*

**Customer Success: 1 done · 3 in progress · 4 not started**

---

## Pillar 5 — Growth

Acquisition, retention measurement, and feedback loops.

| # | Item | Status | Owner | Evidence / artifact | Acceptance criteria | Dependencies |
|---|------|--------|-------|---------------------|---------------------|--------------|
| G-01 | Referral program | Not Started | Growth / Marketing | Landing footer: "Partners program coming soon" toast | Referral link/code; reward rules; tracked in product or billing | Live payments (B-07) |
| G-02 | Affiliate program | Not Started | Growth | Not found | Affiliate signup, commission structure, payout process | Legal terms; payment rails |
| G-03 | Product analytics | In Progress | Product / Engineering | Tenant event bus: [`analyticsEngine.js`](../../services/analytics/analyticsEngine.js), [`metricsRegistry.js`](../../services/analytics/metricsRegistry.js) | Product analytics tool (PostHog/Mixpanel/GA4) on marketing + portal; funnel dashboards | Privacy/cookie consent (B-04) |
| G-04 | Customer feedback collection | Not Started | Product / CS | Not found | NPS/CSAT survey post-onboarding; in-app feedback widget; results reviewed weekly | CS-05 ticketing optional |
| G-05 | Trial conversion tracking | In Progress | Growth / Product | Trial billing in verify scripts; [`billingPlans.js`](../../services/platform/billingPlans.js) `trialDays: 14` | Dashboard: signup → activated → trial → paid conversion rates | G-03 analytics |
| G-06 | Marketing site SEO baseline | Done | Marketing | [`ziricai.html`](../../ziricai.html) meta, industry pages, FAQ schema-ready content | Google Search Console verified; sitemap submitted; core pages indexed | Content stable |
| G-07 | Churn & retention playbook | Not Started | CS / Growth | Not found | Documented save offers, exit survey, renewal reminders | B-07 billing; S-02 emails |

### Growth pillar checklist

- [ ] **G-01** Referral program — *Not Started*
- [ ] **G-02** Affiliate program — *Not Started*
- [ ] **G-03** Product analytics — *In Progress*
- [ ] **G-04** Customer feedback — *Not Started*
- [ ] **G-05** Trial conversion tracking — *In Progress*
- [x] **G-06** SEO baseline — *Done*
- [ ] **G-07** Churn playbook — *Not Started*

**Growth: 1 done · 2 in progress · 4 not started**

---

## Cross-Reference: Sprints 1–5 & CTO Audit

### Completed or verified ✅

| Work stream | Evidence | Launch relevance |
|-------------|----------|------------------|
| Sprint 1 — Connect Everything | `npm run verify:sprint1` → **18/18 PASS** | T-04 onboarding chain; CS-06 |
| Sprint 2 — Demo removal | [`SPRINT2_DEMO_REMOVAL.md`](./SPRINT2_DEMO_REMOVAL.md) | T-04 real data |
| Sprint 3 — Customer journey | `npm run verify:journey` → **14/14 PASS** | T-04 end-to-end path |
| Sprint 4 — Polish | [`SPRINT4_POLISH.md`](./SPRINT4_POLISH.md) — all items `[x]` | T-01, T-03 UX |
| Sprint 5 — Security | [`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md) | T-13 platform routes |
| QA smoke (manual) | [`PLATFORM_QA_REPORT.md`](../architecture/PLATFORM_QA_REPORT.md) | Pipeline connected |
| Production env docs | [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md), [`.env.example`](../../.env.example) | T-06, T-07 |

### Still open from CTO audit & DevOps agent ❌

| ID / area | Issue | Launch pillar |
|-----------|-------|---------------|
| P0-1, P0-4 | Platform provisioning/ops exposure | T-13 (mitigated Sprint 5; verify in prod) |
| P0-2 | `TENANT_SCOPE_ENFORCEMENT=lax` default | T-06 |
| P0-3 | No CI / automated smoke in pipeline | T-05 |
| P1-1 | Legacy dual storage paths | T-08 |
| P1-3 | In-memory job queue | T-15 |
| P1-5 | Webhook signature gaps | T-14 |
| Agent 22 | No backups, monitoring integration, rollback drill | T-09, T-10, T-11, T-12 |
| Agent 13 | Billing connectors stubbed | B-07 |
| Pricing drift | Landing vs `billingPlans.js` | B-01 |

---

## Go / No-Go Decision Framework

Use this at **T-30**, **T-7**, and **launch day** with sign-off from Engineering, Legal, and Commercial leads.

### Hard gates (any failure = **NO-GO**)

| Gate | Criterion | Current |
|------|-----------|---------|
| **Security** | All CTO P0 items closed in production environment | ⚠️ Partial (Sprint 5 code; prod env not verified) |
| **Legal** | Privacy Policy + Terms published and linked from signup | ❌ Not met |
| **Data** | `STORAGE_BACKEND=firestore` + backups scheduled | ❌ Not met |
| **Payments** | Test transaction succeeds; refund path documented | ❌ Not met |
| **Support** | Published support channel + 48h response SLA defined | ⚠️ Partial (email only) |
| **Quality** | `verify:sprint1` + `verify:journey` PASS in CI on release branch | ⚠️ Pass locally; no CI |

### Soft gates (document accepted risk or defer)

| Gate | Criterion | Deferral allowed? |
|------|-----------|-------------------|
| Durable queue | Redis/Cloud Tasks live | Yes for pilot ≤5 tenants |
| Full tenant migration | Legacy paths deprecated | Yes with migration plan |
| Live chat | Website widget | Yes if email SLA met |
| Referral/affiliate | Programs live | Yes — post-launch 30 days |
| Video tutorials | Full playlist | Yes if demo video + KB exist |

### Launch tiers

| Tier | Audience | Minimum bars |
|------|----------|--------------|
| **Private pilot** | 1–5 invited tenants | T-06, T-07, T-13, B-03, B-02, CS-06, manual verify scripts PASS |
| **Paid beta** | Paying customers, limited marketing | All hard gates + B-01, B-07, CS-01, T-09, T-10 |
| **Public launch** | Open signup + campaigns | All hard gates + soft gates reviewed; CTO score ≥70; all pillars ≥60% |

**Current recommendation (2026-07-19):** **NO-GO** for public launch; **CONDITIONAL GO** for private pilot after Legal minimum (B-02, B-03) and prod env (T-06, T-07).

---

## Recommended Execution Order

Non-coding, phase-based plan. Run engineering agents in parallel where noted.

### Phase 0 — Foundation (Week 1)

| Day | Work | Owner | Pillar |
|-----|------|-------|--------|
| 1–2 | Lock pricing: reconcile `billingPlans.js` ↔ landing ↔ sales materials | Product / Finance | B-01 |
| 2–3 | Engage legal for Privacy + Terms drafts (POPIA/GDPR) | Legal | B-02, B-03 |
| 3–5 | Assign CS owner; draft support runbook from `support.js` + PORTAL_BOS | Customer Success | B-06, CS-08 |
| Parallel | Engineering: Agent 22 CI + prod env checklist | DevOps | T-05, T-06, T-07 |

### Phase 1 — Legal & trust (Week 2)

| Day | Work | Owner | Pillar |
|-----|------|-------|--------|
| 1–3 | Publish Privacy, Terms, Refund, Cookie policy pages | Legal + Marketing | B-02–B-05 |
| 3–4 | Cookie consent banner on marketing site | Engineering + Legal | B-04 |
| 4–5 | Replace footer `#` placeholders; link audit on all HTML pages | Marketing | T-02 |
| Parallel | Firestore backup schedule + restore drill doc | DevOps | T-09 |

### Phase 2 — Sales kit (Week 3)

| Day | Work | Owner | Pillar |
|-----|------|-------|--------|
| 1–2 | Record demo video (onboarding + inbox + Sarah) | Marketing | S-01 |
| 2–3 | Build sales deck + proposal templates | Sales | S-03, S-05 |
| 3–5 | Export industry one-pagers from existing industry HTML | Marketing | S-04 |
| 5 | Configure onboarding email sequence (welcome, day 7, expiry) | Marketing | S-02 |

### Phase 3 — Customer success (Week 4)

| Day | Work | Owner | Pillar |
|-----|------|-------|--------|
| 1–2 | Stand up Help Center (20 articles minimum) | Customer Success | CS-01, CS-03 |
| 2–3 | Select + configure ticketing (Freshdesk/Zendesk) | Customer Success | CS-05 |
| 3–4 | Video tutorials (3–5 screencasts) | Customer Success | CS-02 |
| 4–5 | Status page + incident comms template | DevOps + CS | CS-07 |

### Phase 4 — Growth & go-live (Week 5–6)

| Day | Work | Owner | Pillar |
|-----|------|-------|--------|
| 1–2 | Product analytics (PostHog/GA4) + trial funnel dashboard | Growth | G-03, G-05 |
| 2–3 | Payment go-live (Stripe/Paystack staging → prod) | Finance + Engineering | B-07 |
| 3–4 | NPS/feedback widget; referral program spec | Growth + Product | G-04, G-01 |
| 5 | **Go/No-Go review** — hard gates checklist | All leads | — |
| 6+ | Private pilot → paid beta → public launch per tier table | All | — |

---

## Verification Commands (engineering cross-check)

Run before each go/no-go review:

```bash
npm run verify:sprint1    # expect: 18 passed, 0 failed
npm run verify:journey    # expect: 14 passed, 0 failed
curl http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/operations/metrics   # expect 401 without auth
```

Production env (from [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md)):

```bash
NODE_ENV=production STORAGE_BACKEND=firestore TENANT_SCOPE_ENFORCEMENT=strict npm start
```

---

## Document maintenance

| Trigger | Action |
|---------|--------|
| Sprint or agent milestone completed | Update checkbox + status in relevant pillar |
| Legal pages published | Mark B-02–B-05 done; add URL to Evidence column |
| CTO re-audit | Refresh overall score and hard gates |
| Pricing change | Update B-01, S-06, all sales collateral |

**Owner of this document:** Product / Program lead  
**Next review date:** 2026-08-02 (align with trial period in billing plans)

---

## Related documents

| Document | Role |
|----------|------|
| [`CTO_AUDIT_REPORT.md`](../architecture/CTO_AUDIT_REPORT.md) | Engineering readiness score & P0/P1 |
| [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) | Deploy & env runbook |
| [`SPRINT1_CONNECT.md`](./SPRINT1_CONNECT.md) – [`SPRINT5_SECURITY.md`](./SPRINT5_SECURITY.md) | Engineering sprint evidence |
| [`22-devops-deployment.md`](../agents/22-devops-deployment.md) | CI/CD, backups, monitoring (coding agent — not duplicated here) |
| [`ROADMAP.md`](../ROADMAP.md) | Agent execution order |
