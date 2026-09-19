# Mission Control Platform Dashboard — design & implementation charter

**Gate:** MC-U-2 (parent)  
**Prerequisite:** MC-U-1 CLOSED (Tenants directory + taxonomy), MC-U-2A CLOSED (read-only audit)  
**Status:** AUTHORIZED — design charter (implementation via sub-gates only)  
**Release head reference:** `d1c4166` (Tenants + deploy parity)

---

## 1. Purpose

Evolve **Mission Control** from a **single-tenant pilot dashboard** (Central Motors RTB) into a **platform operator control plane** that observes tenant systems **without becoming a second CRM or second analytics engine**.

The **Portal** remains the tenant operating workspace. Mission Control **observes** authoritative tenant data and platform registry state; it does **not** own customer records, conversations, or billing mutations.

---

## 2. Architectural rules (non-negotiable)

1. **Observe, don’t duplicate CRM** — MC reads via existing tenant services and shared read models; no parallel write paths to `companies/{id}/customers`, `leads`, or `conversations`.
2. **One metric, one canonical read model** — Prefer Portal’s existing snapshots (`portalDataHub`, `dashboardService` / `aggregatesStore`) for tenant KPIs; MC adds **platform rollups and filters**, not a third aggregation stack.
3. **Tenant taxonomy is separate** — Use MC-U-1 `tenantClassification.js` (read-only) for counts and filters; do not conflate **74 tenant records** with **production customers** (see `TENANT_TAXONOMY.md`).
4. **Production safety** — No demo KPI injection for production pilot tenants (`central-motors-rtb`); unavailable metrics show explicit unavailability, not fabricated numbers.
5. **Scope selector drives drill-down** — `selectedCompanyId` / top-bar scope must align with dashboard drill-down (fix MC-U-2 gap: main dashboard currently ignores selector).
6. **Phased delivery** — MC-U-2 through MC-U-7 remain separate product areas (Billing, Integrations, Support, Sarah, Tenant Hub); this charter covers **Platform Dashboard (MC-U-2)** only.

---

## 3. Current state (MC-U-2A summary)

| Surface | Today | Primary APIs |
|--------|--------|--------------|
| MC **Mission Control** dashboard | Hard-scoped to `central-motors-rtb`; CRM-style KPIs | `GET /api/operations/metrics`, `activity`, `GET /api/platform/health` |
| MC **Command Center** | Strategic view; demo fallbacks when tenant thin | `GET /api/operations/command-center` |
| MC **Analytics** (module) | Tenant-scoped when company selected | `GET /api/operations/tenant/:companyId/metrics`, `.../analytics/timeseries` |
| Portal **Business Overview** | Full tenant hub KPIs + usage | `GET /api/portal/hub/:companyId` |
| Portal **Analytics** | Rollups, charts, popular questions | `GET /api/portal/analytics/:companyId` |

**Key gaps:** dual aggregation (`tenantMissionMetrics` vs `portalDataHub` / `aggregatesStore`); MC overview not platform-wide; date range on MC dashboard not wired; time-series semantics differ between MC timeseries and Portal analytics.

**Authoritative stores:** Firestore `companies/{companyId}/…` (CRM, conversations, appointments, analytics daily/metrics, workspace counts); platform registry for cross-tenant listing (`GET /api/platform/companies`).

---

## 4. Target experience (MC-U-2)

### 4.1 Platform layer (default landing)

When scope = **All Tenants**, the dashboard shows:

- **Tenant census summary** (from MC-U-1 classifier on company list): total records + class breakdown (not “customers”).
- **Platform health** (existing): API, queue, storage, WhatsApp/OpenAI signals where available.
- **Aggregate operational signals** (read-only): e.g. open conversations, appointments today, active integrations — **summed or counted across tenants** with explicit limits and “partial data” flags when queries cap out.
- **Pilot spotlight** — optional card for `central-motors-rtb` linking to tenant drill-down (not the only data on the page).

### 4.2 Tenant drill-down

When scope = **one tenant** (selector or row link from Tenants):

- Reuse **Portal-equivalent KPI snapshot** for that `companyId` (hub or analytics read model), rendered in MC chrome.
- Clear label: tenant name, **classification badge**, plan/status (operational—not class).
- Links to existing MC modules: Agents, Knowledge, CRM, Portal (unchanged cross-links).

### 4.3 Explicit non-goals (MC-U-2)

- Replacing Portal Analytics UI for tenants.
- New Firestore collections for MC-only CRM.
- Marketplace, Billing, Integrations, Support deep modules (MC-U-3…7).
- Mission Control / Portal **navigation unification** (single app shell).

---

## 5. Proposed technical approach

### Phase A — Read-model alignment (backend, read-only)

- Introduce a **platform read facade** (e.g. `services/operations/platformDashboardService.js`) that:
  - For **tenant scope:** delegates to `getPortalHub()` / `getDashboardSnapshot()` (or thin wrappers) with platform auth.
  - For **platform scope:** iterates registry company list with concurrency limits, classifies via shared policy, aggregates **allowed** numeric fields only.
- Deprecate **new** features on duplicate paths in `platformOperations.getPlatformMetrics` for dashboard UI (keep backward compatibility until MC-U-2B cuts over).
- Document **canonical metric definitions** in this doc’s appendix (maintained as implementation proceeds).

### Phase B — MC dashboard UI (frontend)

- Refactor `js/admin/modules/dashboard.js` to:
  - Read `state.selectedCompanyId` (null = platform view).
  - Fetch new platform dashboard API (single endpoint preferred).
  - Remove hard-coded `PRIMARY_TENANT` from `operationsService.js` for dashboard path only.
- Wire date range to API query params **or** remove control until supported (no fake filters).

### Phase C — Verification & release

- Static verifier: platform vs tenant mode, no CRM writes, selector sync.
- Live acceptance: platform view shows 74 + taxonomy-consistent rollups; RTB drill-down matches Portal hub numbers within documented tolerance.

---

## 6. Sub-gate ledger (MC-U-2)

| Gate | Scope | Deliverable |
|------|--------|-------------|
| **MC-U-2A** | Audit | CLOSED — dashboard vs Portal comparison |
| **MC-U-2B** | Read-model API | Platform dashboard read endpoint(s), no UI break |
| **MC-U-2C** | UI platform view | All-tenants dashboard + selector integration |
| **MC-U-2D** | UI tenant drill-down | Hub-aligned tenant view + acceptance |
| **MC-U-2E** | Cleanup | Retire duplicate MC aggregation for overview (optional, gated) |

Implementation **must not** start until **MC-U-2B** is explicitly authorized (API contract + metric appendix frozen).

---

## 7. API sketch (MC-U-2B design target)

```
GET /api/operations/platform-dashboard
  ?scope=platform|tenant
  &companyId=<required when scope=tenant>
  &from=&to=   (optional; ISO dates — only if backend supports)
```

Response sections (illustrative):

- `tenantCensus` — from company list + read-only classifier (MC-U-1).
- `platformHealth` — existing health payload.
- `kpis` — scope-dependent (aggregated vs tenant snapshot).
- `activity` — recent platform or tenant activity (read-only).
- `meta` — `dataSource`, `partial`, `generatedAt`, `companyId`.

All routes under **`requirePlatformAccess`**; tenant scope validates `companyId` exists in platform registry.

---

## 8. Dependencies & constraints

- **MC-U-1** Tenants UI and classifier (committed `0957731`, `d1c4166`).
- **Portal hub/analytics** services stable for pilot tenant.
- **No TP-3D / 4C-6 scope creep** in MC-U-2 gates unless explicitly merged by operator.
- **Netlify admin** deploy must include `prepare-sites` parity (`_sources` shell).

---

## 9. Success criteria (MC-U-2 complete)

1. Platform dashboard loads with **All Tenants** scope and shows taxonomy-aware census + health.
2. Selecting **Central Motors RTB** shows hub-aligned KPIs consistent with Portal for same tenant (documented fields).
3. No new write endpoints; no classification metadata writes.
4. Verifier + live acceptance documented; release tied to git `main`.

---

## 10. Related documents

- `docs/architecture/TENANT_TAXONOMY.md` — classification policy
- `docs/architecture/PORTAL_BOS.md` — tenant workspace boundaries
- `docs/architecture/ANALYTICS_AUTOMATION.md` — rollups / events (if present)

---

*Charter version: 2026-09-19 — MC-U-2 authorized; implementation begins at MC-U-2B authorization.*
