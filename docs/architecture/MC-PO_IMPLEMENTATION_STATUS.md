# MC-PO — implementation status

**Authorised:** 2026-11-11 (MC-PO-01…11 programme)  
**Contract:** [MC-PO-01_API_CONTRACT_AND_METRICS.md](./MC-PO-01_API_CONTRACT_AND_METRICS.md)  
**Audit:** [MC-PO-00_PLATFORM_COMMAND_GOVERNANCE_AUDIT.md](./MC-PO-00_PLATFORM_COMMAND_GOVERNANCE_AUDIT.md)

## Shipped in this release

| Gate | Deliverable | Status |
|------|-------------|--------|
| MC-PO-01 | `GET /api/operations/platform-command-overview`, dashboard growth + RS02 panel | **Done** |
| MC-PO-02 | Consumer directory APIs + **Sarah Users** MC module | **Done** (v1 capped scan) |
| MC-PO-03 | `platformEvents` store, bootstrap hook, activity overview + UI | **Done** (minimal ingest) |
| MC-PO-04 | Consumer safety cases + enforcement on `userProfiles.platformSafety` + UI | **Done** (no appeals yet) |
| MC-PO-02A | Consumer profile panel in Sarah Users (metadata, orgs, safety signals) | **Done** (v1) |
| MC-PO-04A | Safety signals, overview API, chat detection layer | **Done** (rules v1) |
| MC-PO-05 | Sarah Network | **Unchanged** (existing SNET-09 module) |
| MC-PO-06 | Telemetry ingest + monitor overview + UI; Sarah App `session.start` | **Done** (v1) |
| MC-PO-07 | Platform announcements CRUD (draft/publish store) + UI | **Done** (no fan-out delivery) |
| MC-PO-08 | RS02 console API + Billing module RS02 section | **Done** |
| MC-PO-09 | Org oversight API + UI | **Done** (summary) |
| MC-PO-10 | `viewPlatformCommandOverview` MC Sarah tool | **Done** |
| MC-PO-11 | `platformAdminAudit`, expanded `platformRbac` roles, audit UI | **Done** (v1) |

## Follow-ups (not blocking v1)

- Materialised daily rollups for large `userProfiles` corpora (remove 5000 scan cap).
- Message volume buckets (personal / company / system) wired from chat pipelines.
- Platform announcement delivery to `networkNotifications` with audience filters and POPIA marketing checks.
- Consumer safety appeals workflow and Status/message content moderation.
- Dual approval for `terminate` and financial adjustments.

## Verify

```bash
node test/mc-po-platform-command.test.mjs
node --test test/mc-consumer-safety.test.mjs
```

Deploy Mission Control: `node scripts/prepare-sites.js admin` then Netlify admin site.
