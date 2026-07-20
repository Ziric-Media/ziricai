# 17 — Dashboard Agent

## Agent Name & Role

Owns the Company Portal Business Overview dashboard: hub data, KPI widgets, charts, and live refresh UX.

## Phase

**Phase 8 — Customer Dashboard**

## Responsibility

- Portal dashboard module layout and widgets
- Hub data consumption via `dataService` / `portalDataHub`
- KPI cards, live stats, conversation previews, activity feed, quick actions
- Dashboard refresh and cache invalidation
- Chart rendering (usage trends)
- Demo fallback behavior when hub empty

## Owns

- `js/portal/modules/dashboard.js`
- `js/portal/core/widgets/` (kpiCard, liveStatCard, conversationPreview, activityFeed, quickActions, loadingSkeleton, emptyState)
- `js/portal/core/dataService.js` (hub getters)
- `services/portal/portalDataHub.js`
- `services/analytics/dashboardService.js` (consumer only — coordinate with Analytics Agent)
- `js/portal/demo-data.js` (dashboard demo sections)
- `docs/architecture/PORTAL_BOS.md`

## Depends on

- **03 Company Workspace Agent** — hub company context
- **14 Analytics Agent** — metrics in hub snapshot
- **08 Conversations Agent** — recent conversations widget
- **11 Notifications Agent** — activity feed items

## Do NOT touch

- Analytics aggregation internals (Analytics Agent)
- Admin superadmin dashboard (Super Admin Agent)
- Sarah UI (Sarah AI Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Dashboard Agent. Own portal Business Overview page and widget library.

Read docs/architecture/PORTAL_BOS.md, js/portal/modules/dashboard.js, services/portal/portalDataHub.js.
Review widget components in js/portal/core/widgets/.

Tasks:
1. Ensure dashboard loads exclusively from getHubData() in production mode (minimize demoCompanyDashboard fallback).
2. Wire refresh button to invalidateHub() + reload metrics and recent conversations.
3. Usage chart uses hub.usage series; destroy/recreate chart on navigation to avoid leaks.
4. Quick actions navigate to correct modules (conversations, Sarah, marketplace).
5. Live stat card shows hub.generatedAt with sensible polling interval (optional).

Do NOT modify analytics engine or admin command center dashboard.
Return: widget data source map (live vs demo), UX issues, files changed.
```

## Definition of Done

- [ ] Dashboard renders from hub API with <2s load on warm cache
- [ ] All KPI widgets show live metrics when tenant has data
- [ ] Recent conversations + activity panels populated from hub
- [ ] Refresh invalidates cache and updates timestamp
- [ ] Quick actions route correctly
- [ ] Demo fallback only when `demo mode` explicit

## Current status

**88% — Near complete**

### Already built

- Full dashboard module with header, KPI grid, charts, previews
- Widget library (7 components) in `core/widgets/`
- Hub via `portalDataHub` + 60s TTL cache in dataService
- **Live metrics from tenant APIs** — zeros/empty states for new tenants; demo only for `demo-central-motors`
- Hub refresh on login, Sarah, marketplace install, conversation reply
- Loading skeletons and error states
- PORTAL_BOS architecture doc with widget data source table

### Remaining work

- Usage chart library lifecycle may leak on re-navigation
- No customizable dashboard layouts per role
- Live polling optional — mostly manual refresh
