# 14 — Analytics Agent

## Agent Name & Role

Owns event-driven analytics engine, daily aggregates, metrics registry, and analytics UI modules.

## Phase

**Phase 6 — Intelligence**

## Responsibility

- Analytics engine and aggregates store (batch flush)
- Metrics registry and event type mappings
- Dashboard service BI snapshots
- Tenant analytics service
- Analytics event handler on event bus
- Portal and admin analytics modules
- Sarah `viewAnalytics` tool

## Owns

- `services/analytics/` (entire folder)
- `services/events/analyticsEventHandler.js`
- `js/portal/modules/analytics.js`
- `js/admin/modules/analytics.js`
- `docs/architecture/ANALYTICS_AUTOMATION.md`
- `docs/architecture/PERFORMANCE.md` (analytics query sections)

## Depends on

- **01 Platform Architecture Agent** — event store
- **08 Conversations Agent** — message events
- **10 Automation Agent** — automation success metrics
- **13 Billing Agent** — usage/token metrics (read-only)

## Do NOT touch

- PDF/CSV report generation (Reporting Agent)
- Dashboard layout/widgets (Dashboard Agent consumes analytics API)
- Marketplace pack analytics seeds (Marketplace Agent installs; Analytics Agent records)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Analytics Agent. Own metrics collection, aggregation, and analytics UI data.

Read docs/architecture/ANALYTICS_AUTOMATION.md, services/analytics/analyticsEngine.js, aggregatesStore.js, dashboardService.js.
Verify analyticsEventHandler subscribes to all relevant EventTypes.

Tasks:
1. Replace hardcoded trend percentages in dashboardService with computed deltas from daily aggregates.
2. Ensure ANALYTICS_BATCH_SIZE flush writes to companies/{id}/analyticsDaily/{date}.
3. Portal analytics module: charts from GET dashboard snapshot API (not demo-only).
4. Wire metricsRegistry events for appointments, leads, conversions from real event bus traffic.
5. Add GET /api/analytics/events/:companyId for debugging (paginated).

Do NOT build PDF export (Reporting Agent) or change dashboard widget layout.
Return: metric coverage table, demo vs live data sources, files changed.
```

## Definition of Done

- [ ] All key EventTypes increment correct metrics in aggregatesStore
- [ ] Daily aggregates persisted under tenant path
- [ ] Dashboard snapshot API returns computed trends (not static defaults)
- [ ] Portal + admin analytics charts use live API
- [ ] Batch flush configurable via env vars
- [ ] Popular questions / AI accuracy tracked from real data

## Current status

**65% — Partial**

### Already built

- Full analytics folder: engine, aggregatesStore, metricsRegistry, dashboardService
- Event handler registered at startup (QA verified)
- Portal + admin analytics modules
- Dashboard service builds chart series from daily rows
- Tenant analytics service for platform events
- Batch flush env vars documented

### Remaining work

- Trend percentages in `dashboardService` include **static defaults** (e.g. 8.5%)
- Some KPIs fall back to **demo values** when aggregates empty
- `tenantAnalyticsService` described as stub in ARCHITECTURE.md
- No collection group queries for superadmin cross-tenant analytics
- Token usage estimated from message counts, not OpenAI usage API
