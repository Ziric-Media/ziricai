# 15 — Reporting Agent

## Agent Name & Role

Owns exportable reports, report templates, scheduled reports, and Sarah generateReport tool implementation.

## Phase

**Phase 6 — Intelligence**

## Responsibility

- Report template storage per tenant
- Report generation service (CSV, PDF)
- Marketplace pack report templates on install
- Sarah `generateReport` tool (currently stub)
- Super Admin platform reports
- Scheduled report delivery (email via Integration Agent)

## Owns

- Future: `services/reporting/` (to be created)
- `services/sarah/tools/generateReport.js`
- `services/storage/memoryAdapter.js` (`saveReportTemplates`, `getReportTemplates`)
- Marketplace report definitions in `services/platform/marketplaceRegistry.js`
- `services/platform/industryPackService.js` (report install section)
- Future: `js/portal/modules/reports.js`

## Depends on

- **14 Analytics Agent** — data source for reports
- **07 CRM Agent** — pipeline/customer reports
- **13 Billing Agent** — billing/usage reports
- **12 Integration Agent** — email delivery of scheduled reports

## Do NOT touch

- Analytics aggregation engine internals
- Dashboard widget rendering (Dashboard Agent)
- Sarah orchestrator beyond generateReport tool

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Reporting Agent. This is the largest intelligence gap (~25% complete).

Audit services/sarah/tools/generateReport.js (stub), memoryAdapter reportTemplateStore, marketplace pack reports in industryPackService.js.

Tasks:
1. Create services/reporting/reportService.js with generateReport(companyId, type, format).
2. Implement CSV export for: conversations summary, CRM pipeline, usage/billing.
3. Replace Sarah generateReport stub with real reportService call + download link.
4. Add portal Reports section or integrate into analytics module export buttons.
5. On marketplace install, persist pack.reports to tenant report templates.

Do NOT rewrite analytics aggregates or dashboard layout.
Return: report types implemented, API routes, Sarah tool behavior, remaining PDF work.
```

## Definition of Done

- [ ] `reportService.js` generates at least 3 report types to CSV
- [ ] Sarah generateReport returns downloadable artifact or portal navigation
- [ ] Marketplace install saves report templates to tenant storage
- [ ] Portal export buttons work (analytics, CRM, conversations)
- [ ] Scheduled report job documented (cron/queue hook)
- [ ] PDF generation scoped as Phase 2 with library choice documented

## Current status

**25% — Partial**

### Already built

- Report template storage in memory adapter
- Marketplace packs define report metadata (pipeline, weekly_summary types)
- `industryPackService` saves report templates on pack install
- Sarah generateReport tool registered (stub message)
- Analytics module may mention export in UI copy

### Remaining work

- **No `services/reporting/` module**
- generateReport is **explicit stub** ("coming soon")
- **No portal reports module** or working export buttons
- No PDF generation library integrated
- No scheduled report runner
- Super Admin platform reports not implemented
