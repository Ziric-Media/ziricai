# Sprint 2 — Remove Demo Data

**Goal:** Every screen displays live tenant data. Hardcoded demo is fallback-only.

## Central logic

| Module | Purpose |
|--------|---------|
| `services/core/dataMode.js` | Server: `isDemoTenant()`, `shouldUseDemoFallback()`, `shouldSeedDemoData()` |
| `js/shared/dataMode.js` | Browser mirror for portal modules |

Demo fallback applies **only** when:

- `companyId === demo-central-motors`, or
- `DEMO_SEED=true`, or
- No `companyId` (lax dev / unauthenticated)

## Changes

### Server

- `services/portal/portalDemo.js` — seed/fallback layer, not primary for provisioned tenants
- `services/portal/portalDataHub.js` — live metrics from tenant services; demo metrics only for demo tenant
- `services/storage/seedCustomerOpsDemo.js` — runs only when `shouldSeedDemoData()` is true

### Portal modules (API-first + empty states)

| Module | Live API | Demo fallback |
|--------|----------|---------------|
| dashboard | `/api/portal/hub/:companyId` | hub demo flags only |
| agents | `/api/companies/:id/ai-employees` | demo-central-motors only |
| conversations | `/api/companies/:id/conversations` | hub preview for demo tenant |
| customers | CRM tenant APIs | empty state |
| analytics | `/api/portal/analytics/:id` | demo-central-motors only |
| billing | `/api/portal/usage/:id` | demo-central-motors only |
| notifications | `/api/portal/notifications/:id` | empty |
| team | `/api/portal/team/:id` | workspace / empty |
| knowledge | `/api/companies/:id/knowledge/documents` | demo-central-motors only |
| activity | `/api/portal/activity/:id` | demo-central-motors only |

### Admin

- `js/admin/services/companies.js` — `/api/platform/companies` first, local demo last
- `js/admin/services/operationsService.js` — ops API first; demo only when API unreachable

### Auth

- `js/portal/auth-guard.js` — `resolveDemoProfile` kept for lax mode when no Firestore profile
- Branding defaults to neutral palette for real tenants

## Verification

```bash
npm run verify:sprint1   # onboarding chain still passes
STORAGE_BACKEND=memory npm run dev
```

Sign up a new tenant → portal modules show zeros/empty states, not Central Motors data.

## Remaining demo surfaces (intentional)

- `js/admin/demo-data.js` — fallback store for Super Admin when Firestore empty
- `demo-central-motors` showcase tenant when explicitly selected
- `resolveDemoProfile()` for portal login without profile (dev only)
