# CTO Audit Report — ZiricAI Platform

**Audit date:** 2026-07-19  
**Auditor:** Agent 21 — Chief Technology Officer  
**Scope:** Full codebase after Phases 1–8 (+ partial Phases 9, 19)  
**Method:** Doc cross-check, route/service grep, Firestore rules/index review, server startup verification, PLATFORM_QA_REPORT cross-reference  
**Server check:** `node server.js` — **PASS** (imports OK, listens on port 3000)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall readiness score** | **52 / 100** |
| **Weighted agent completion (01–20)** | ~58% |
| **Production go/no-go** | **NO-GO** for public multi-tenant launch |
| **Demo / pilot go/no-go** | **CONDITIONAL GO** (single-tenant demo with lax auth) |

ZiricAI has strong **architecture documentation**, a **working Express monolith**, **tenant service scaffolding**, **Sarah AI + Integration Hub wiring**, and a **unified portal hub**. The platform is not production-ready for scale or untrusted users because **tenant enforcement defaults to lax**, **platform provisioning and operations APIs are unauthenticated**, **legacy flat storage paths remain active**, and **CI/smoke automation is absent**.

**Agent 22 (DevOps)** must run immediately after this audit to establish CI/CD, production env enforcement, monitoring, and rollback before any public deploy.

---

## Question-by-Question Findings

### 1. Is every page using the service layer?

**Verdict: Partial**

| Surface | Pattern | Evidence |
|---------|---------|----------|
| Company Portal | API → Express services | `js/portal/api.js` → `js/shared/apiRequest.js` → `/api/*`; hub via `js/portal/core/dataService.js` |
| Super Admin | API + Firestore fallback | `js/admin/api.js` shared client; `js/admin/services/conversations.js` falls back to direct Firestore (`firestore-base.js`) when API empty |
| Onboarding | Firebase Auth client + API | `js/onboarding/main.js` uses `../auth.js`, `../users.js`, `./api.js` |
| Landing / industry pages | Static only | `js/ziricai-landing.js` — animations/ROI, no backend |
| Auth test | Firebase client | `auth-test.html` + `js/auth.js` |

**Gaps:**
- `js/portal/modules/conversations.js` — raw `fetch()` for takeover (bypasses `apiRequest`, no Bearer token)
- `js/portal/sarah/sarah-chat.js` — raw `fetch()` for Sarah endpoints
- `js/portal/modules/analytics.js` — `window.open()` to report URL without auth headers
- Admin inbox still dual-path: API first, Firestore direct read/write fallback

---

### 2. Is Firestore optimized?

**Verdict: Partial**

**Strengths:**
- `services/database/tenantRepository.js` — scoped paths, `listPage()` cursor pagination, default caps
- Tenant subcollections documented in `docs/architecture/FIRESTORE_SCHEMA.md`
- Collection-group indexes for cross-tenant admin queries
- Event batching via `ANALYTICS_BATCH_SIZE` / `ANALYTICS_FLUSH_MS`

**Gaps:**
- Default `STORAGE_BACKEND=memory` in dev (server log: `[storage] Using memory adapter`)
- Legacy root collections (`customers`, `knowledge`, `conversations`) still written by webhook/CRM paths — see `@deprecated` on `services/customerService.js`
- Dual-write in `services/tenants/aiEmployeeService.js` (tenant + legacy adapter)
- No Firestore backup/export automation
- Single-process in-memory job queue — not durable at scale

---

### 3. Are indexes correct?

**Verdict: Partial (Pass for documented queries, gaps for edge cases)**

**Evidence:** `firestore.indexes.json` defines 18 composite indexes covering customers, conversations, tasks, notifications, leads, aiEmployees, appointments, documents, events, automationRuns — aligned with `services/database/schema.js` collection-group patterns.

**Gaps:**
- Some `COLLECTION_GROUP` indexes include `companyId` field — valid for legacy flat docs; tenant subcollection docs may not populate `companyId` on every document (queries should use path scope, not redundant field)
- `mountCustomerOpsRoutes` CRM pipeline queries not fully cross-checked against deployed indexes in production Firebase project
- Index deploy is manual (`firebase deploy --only firestore:indexes`) — no CI verification

---

### 4. Is there duplicated code?

**Verdict: Partial (significant duplication remains by design during migration)**

| Duplication | Locations | Status |
|-------------|-----------|--------|
| Customer CRM | `services/customerService.js` vs `services/tenants/crmService.js` | Legacy + tenant parallel |
| Conversations | `services/conversationService.js` vs `services/tenants/conversationService.js` | Tenant wraps legacy |
| Knowledge | `services/knowledgeService.js` vs `services/tenants/knowledgeService.js` | Dual path |
| Workflows | `services/workflows/workflowService.js` (in-memory studio) vs `services/automation/workflowRegistry.js` (tenant automations) | Two systems |
| AI facade | `services/aiService.js` re-exports `services/ai/aiService.js` | Facade (fixed) |
| HTTP clients | `js/shared/apiRequest.js` consolidates portal/admin | ✅ Reduced |
| Portal hub fetch | `js/portal/api.js` delegates to `dataService` | ✅ Reduced |
| Admin API vs Portal API | Overlapping endpoint wrappers in `js/admin/api.js` and `js/portal/api.js` | Partial overlap |
| Windows path duplicates | `services\whatsapp.js` and `services/whatsapp.js` (git casing) | Cosmetic |

---

### 5. Is every AI employee reusable?

**Verdict: Partial**

**Strengths:**
- Central role templates: `services/ai-core/employeePrompts.js` (`ROLE_TEMPLATES`, `resolveRoleTemplate`, `buildEmployeeSystemPrompt`)
- Tenant CRUD: `services/tenants/aiEmployeeService.js` extends `ServiceBase`
- Marketplace provisioning: `services/platform/provisioningService.js` → `saveAiEmployee`
- Sarah bridge: `services/ai-core/aiCoreBridge.js` resolves default employee per tenant
- Employee packs: `services/platform/employeePacks.js`

**Gaps:**
- Legacy `storageAdapter.getAgent` / `listAgents` still consulted before/alongside tenant store
- No single runtime interface enforced across WhatsApp worker, Sarah tools, and portal agent picker (each imports different paths)
- Role templates cover ~8 roles; industry packs may define ad-hoc prompts outside `employeePrompts.js`

---

### 6. Are APIs RESTful?

**Verdict: Partial**

**Strengths:**
- Canonical catalog: `services/api/routeRegistry.js` + `docs/architecture/API.md`
- Tenant resources use path params: `/api/companies/:companyId/conversations`, `/crm/customers`, `/appointments`
- HTTP verbs mostly correct (GET list, POST create, PATCH update, DELETE where implemented)
- `X-API-Version: 1` header via middleware

**Gaps (non-RESTful / inconsistent):**
- Legacy query-param tenancy: `/api/customers?companyId=`, `/api/conversations?companyId=`, `/api/workflows?companyId=`
- Duplicate conversation list routes: legacy `/api/conversations` vs tenant `/api/companies/:companyId/conversations` (in `customerOpsRoutes.js`)
- RPC-style actions: `/takeover`, `/cancel`, `/run`, `/provision` — acceptable but mixed with resource model
- `POST /api/sarah/chat` — RPC (OK for AI)
- Route registration split across `server.js` (~1300 lines) and `services/api/customerOpsRoutes.js` — harder to audit
- Appointments routes exist in `customerOpsRoutes.js` but not duplicated in main `server.js` grep (mounted at line 1267) — documentation drift risk

---

### 7. Are permissions secure?

**Verdict: Fail (for production); Partial (for controlled demo)**

**Strengths:**
- Firestore rules: tenant isolation via `tenantSubcollection()` in `firestore.rules`
- Server matrix: `services/auth/permissionsService.js` (`PERMISSION_MATRIX`, `ROUTE_PERMISSIONS`)
- `checkPermission()` on sensitive routes (knowledge upload, AI employees, marketplace install, branding)
- Strict mode design in `services/core/tenantContext.js` (`assertTenantAccess`, membership check)

**Critical gaps:**
- **`TENANT_SCOPE_ENFORCEMENT` defaults to `lax`** — unauthenticated API access allowed when no Bearer token (`tenantContext.js` line 13)
- **Unauthenticated platform routes** (no `requireSuperAdmin`):
  - `GET /api/operations/metrics` (`server.js` ~226)
  - `GET /api/operations/activity` (~237)
  - `POST /api/platform/provision/company` (~810)
  - `POST /api/platform/provision/agent` (~826)
- **`checkPermission` skipped in lax mode** when `!ctx?.uid` (permissionsService.js ~66–68)
- Portal demo profile mapping in `js/portal/auth-guard.js` (`resolveDemoProfile`) — bypasses real tenant membership
- Many tenant routes use `requireTenantScope({ optional: true })` — companyId alone insufficient in prod
- Firestore client-side admin fallback could bypass API permission checks if rules misconfigured

---

### 8. Can another developer understand this project?

**Verdict: Pass**

**Evidence:**
- 20+ agent specs in `docs/agents/`
- Architecture set: `ARCHITECTURE.md`, `FIRESTORE_SCHEMA.md`, `API.md`, `MIGRATION.md`, `SARAH.md`, `INTEGRATION_HUB.md`
- `services/README.md` — layer responsibilities
- `docs/ROADMAP.md` — dependency graph and execution waves
- `docs/architecture/PLATFORM_QA_REPORT.md` — honest gap list
- Named conventions: `companyId`, `*Service.js`, event bus patterns

**Friction points for new devs:**
- Dual legacy/tenant paths without runtime warnings
- `server.js` monolith size
- Phase numbering inconsistency (ROADMAP Phase 8 Admin vs Phase 9 Admin in agent table)

---

## Cross-Cutting Assessments

### Module-to-module communication

**Verdict: Partial**

**Connected:**
- Webhook → Integration Hub → job queue → message worker → event bus → analytics + automation handlers (verified in PLATFORM_QA_REPORT)
- Portal hub prefetch → dashboard, notifications, conversations modules
- Marketplace install → provisioning service → tenant aiEmployees/knowledge
- Sarah chat → orchestrator → tenant tool registry

**Not fully connected:**
- Appointments backend exists (`services/tenants/appointmentService.js`, API in `customerOpsRoutes.js`) but portal module maturity ~35%
- Reporting (`services/reporting/reportService.js`) — minimal UI integration
- Billing connectors stubbed (`stripeAdapter`, `paystackAdapter` stubs)
- Super Admin automation studio uses in-memory `workflowService`, not tenant `workflowRegistry`
- Notifications portal module partially wired

### Scalable to 1M companies?

**Verdict: Fail**

| Factor | Current state | At 1M tenants |
|--------|---------------|---------------|
| Data model | Tenant subcollections ✅ | Viable with sharding discipline |
| Query patterns | Paginated lists, indexes ✅ | Needs per-tenant hot-spot monitoring |
| Job queue | In-process memory queue | **Breaks** — needs Redis/Cloud Tasks |
| Webhook processing | Single worker concurrency=1 | **Bottleneck** |
| Portal hub | 60s in-memory cache per process | Needs CDN + distributed cache |
| Platform ops | Demo metrics in `platformOperations.js` | Not real aggregation |
| Provisioning | Synchronous HTTP | Needs async provisioning pipeline |
| Firestore cost | Unbounded list without strict caps in all paths | Budget risk |

### UI consistency

**Verdict: Partial**

- Separate stylesheets: `css/company-portal.css`, `css/admin-dashboard.css`, `css/ziricai-landing.css`, `css/onboarding.css`
- Portal uses widget library (`js/portal/core/widgets/`) — good internal consistency
- Admin console different layout/components (`js/admin/ui.js`)
- Shared toast via portal importing `../admin/ui.js` — minor coupling
- Industry landing pages share landing CSS pattern
- No shared design token file or component library across portal/admin

### Production readiness gaps

| Area | Status |
|------|--------|
| CI/CD | ❌ No `.github/workflows/` |
| Automated tests | ❌ Only `auth-test.html` manual |
| Smoke tests | ❌ Documented curl only |
| Strict auth | ❌ Default lax |
| Firestore production backend | ⚠️ Not default locally |
| Webhook signature verification | ⚠️ Partial/stub |
| Monitoring/alerting | ❌ Not configured |
| Backups | ❌ Not documented |
| Rollback | ⚠️ High-level only |
| Secrets management | ⚠️ `.env.example` exists; no CI secrets pattern |
| HTTPS/public deploy | ⚠️ Documented for Meta, not automated |

---

## Critical Issues

### P0 — Block production launch

| ID | Issue | Evidence | Owner |
|----|-------|----------|-------|
| P0-1 | **Unauthenticated tenant provisioning** — anyone can `POST /api/platform/provision/company` | `server.js` ~810–823 | Agent 02 + **22** |
| P0-2 | **`TENANT_SCOPE_ENFORCEMENT=lax` by default** — cross-tenant API access if companyId guessed | `tenantContext.js` line 13; `.env.example` | Agent 02 |
| P0-3 | **No CI or automated smoke tests** — regressions undetected | No `.github/workflows/`; Agent 20 at 45% | Agent **22** + 20 |
| P0-4 | **Platform operations APIs public** — metrics/activity exposed | `server.js` ~226–244 | Agent 02 + **22** (network layer) |

### P1 — High priority pre-scale

| ID | Issue | Evidence | Owner |
|----|-------|----------|-------|
| P1-1 | Legacy CRM/conversation/knowledge dual-path | `customerService.js`, webhook pipeline | Agent 01, 07, 08 |
| P1-2 | Raw fetch bypasses Bearer token in portal | `conversations.js`, `sarah-chat.js` | Agent 17, 04 |
| P1-3 | In-memory job queue not durable | `services/queue/jobQueue.js` | Agent 12 + **22** |
| P1-4 | Admin Firestore direct access fallback | `js/admin/services/conversations.js` | Agent 18 |
| P1-5 | Meta webhook signature verification incomplete | PLATFORM_QA_REPORT §9 | Agent 12 |

### P2 — Medium / tech debt

| ID | Issue | Evidence | Owner |
|----|-------|----------|-------|
| P2-1 | Duplicate workflow systems | workflowService vs workflowRegistry | Agent 10 |
| P2-2 | `server.js` monolith (~1300 lines) | Hard to navigate | Agent 01 |
| P2-3 | Appointments UI immature | Agent 09 at 35% | Agent 09 |
| P2-4 | Reporting at 25% | Agent 15 | Agent 15 |
| P2-5 | UI design tokens not shared | Separate CSS files | Agent 17, 18 |
| P2-6 | Empty `routes/webhook.js` stub | Unused | Agent 12 |

---

## Refactor Recommendations (Prioritized — No Implementation)

1. **Agent 22:** Add CI workflow + `npm run smoke`; document prod env trinity (`strict`, `firestore`, `production`).
2. **Agent 02:** Gate `/api/platform/provision/*` and `/api/operations/*` with `requireSuperAdmin()` regardless of lax mode; enable strict enforcement in staging.
3. **Agent 01 + 08:** Complete legacy→tenant cutover for webhook and inbox; run `npm run migrate:tenants` in staging.
4. **Agent 17 + 04:** Route all portal HTTP through `apiRequest.js` (takeover, Sarah, reports).
5. **Agent 12:** External durable queue (Redis/Cloud Tasks) + webhook signature verification.
6. **Agent 01:** Split route mounting from `server.js` into domain routers (already started with `customerOpsRoutes.js`).
7. **Agent 10:** Deprecate in-memory workflow studio or sync to tenant `workflowRegistry`.
8. **Agent 20:** Expand smoke matrix to cover strict-auth mode and provisioning denial tests.

**P0 code changes deferred in this audit** — server starts; fixes assigned to Agents 02 and 22 per boundary rules.

---

## Agent Status Verification (01–20)

| # | Agent | Doc % | Audit % | Notes |
|---|-------|-------|---------|-------|
| 01 | Platform Architecture | 88% | **85%** | Migration script exists; legacy paths remain at runtime |
| 02 | Authentication | 60% | **55%** | Strict path coded; lax default; open provision routes |
| 03 | Company Workspace | 65% | **65%** | Provisioning works; demo profile mapping active |
| 04 | Sarah AI | 70% | **68%** | Tools wired; raw fetch in UI |
| 05 | AI Employees | 65% | **62%** | Reusable prompts; legacy adapter fallback |
| 06 | Knowledge Base | 60% | **58%** | Upload works; dual storage path |
| 07 | CRM | 55% | **52%** | Tenant CRM routes in customerOpsRoutes; legacy primary for webhook |
| 08 | Conversations | 60% | **58%** | Pipeline connected; takeover fetch gap |
| 09 | Appointments | 35% | **35%** | Backend + API exist; UI thin |
| 10 | Automation | 65% | **60%** | Event-driven engine OK; studio split brain |
| 11 | Notifications | 55% | **52%** | Tenant service + API; partial portal |
| 12 | Integration | 60% | **58%** | WhatsApp live; other channels stub |
| 13 | Billing | 45% | **40%** | Plan catalog only; no live payments |
| 14 | Analytics | 65% | **62%** | Event bus + dashboard API |
| 15 | Reporting | 25% | **25%** | Weekly report endpoint; minimal UI |
| 16 | Marketplace | 70% | **68%** | 21-pack catalog; install flow works |
| 17 | Dashboard | 70% | **68%** | Hub + lazy load solid |
| 18 | Super Admin | 65% | **60%** | Firestore fallback weakens API-only model |
| 19 | Performance | 40% | **42%** | Indexes + cache; no benchmarks |
| 20 | QA & Production | 45% | **45%** | Checklist exists; no automation |

**Revised weighted average:** ~**57%** (slightly below ROADMAP 58% due to security findings)

---

## What Agent 22 Must Own for Production

| Responsibility | Deliverable |
|----------------|-------------|
| CI pipeline | `.github/workflows/ci.yml` — install, import check, smoke |
| Deploy pipeline | Firebase rules/indexes/hosting deploy workflow or documented manual gate |
| Environment | `.env.example` sync; staging vs prod matrix; secrets via CI |
| Smoke automation | `scripts/smoke/smoke-test.js` + `npm run smoke` |
| Monitoring | Uptime on `/api/health`; structured logging contract; error reporting hook points |
| Backups | Firestore scheduled export + restore drill doc |
| Rollback | Versioned deploy revert + rules rollback runbook |
| Migration ops | Execute `scripts/migrate-*` in maintenance windows with checklist |
| Network hardening | IP allowlist or auth gateway in front of Express until Agent 02 completes route gates |
| Process management | PM2/Docker/Cloud Run definition for Node server |

---

## Go / No-Go Recommendation

| Environment | Decision | Blockers |
|-------------|----------|----------|
| **Public production** | **NO-GO** | P0-1 through P0-4 |
| **Private pilot (1–5 tenants)** | **GO with conditions** | Strict auth, firestore backend, HTTPS, manual deploy checklist |
| **Local demo** | **GO** | Current defaults acceptable |

---

## 30-Day Prioritized Plan

| Week | Agents | Focus |
|------|--------|-------|
| 1 | **22**, **02**, **20** | CI/smoke, strict auth staging, lock provisioning routes |
| 2 | **01**, **08**, **07** | Tenant migration cutover, webhook path, CRM legacy deprecation |
| 3 | **12**, **17**, **04** | Durable queue plan, portal API client cleanup, Sarah auth headers |
| 4 | **21** (re-run), **22** | Re-audit score target ≥70; first production deploy to staging |

---

## Related Documents

- [`docs/ROADMAP.md`](../ROADMAP.md)
- [`docs/agents/README.md`](../agents/README.md)
- [`docs/agents/21-cto-audit.md`](../agents/21-cto-audit.md)
- [`docs/agents/22-devops-deployment.md`](../agents/22-devops-deployment.md)
- [`docs/architecture/PLATFORM_QA_REPORT.md`](./PLATFORM_QA_REPORT.md)
- [`docs/deployment/PRODUCTION_CHECKLIST.md`](../deployment/PRODUCTION_CHECKLIST.md)
