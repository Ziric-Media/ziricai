# SF-CORE-01 — F5 acceptance matrix (F-001–F-030)

**Programme status:** F5 **partial** — automated cases below; manual/deferred/live sign-off open. Per-case statuses: [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md). Evidence ladder: [`SF_CORE_01_FULL_PROGRAM.md`](./SF_CORE_01_FULL_PROGRAM.md).

**Runner:** `node scripts/verify-finance-sarah-f5-acceptance.mjs`  
**Optional loopback:** `npm run dev:finance-acceptance` on `127.0.0.1:3099` (extends coverage for HTTP + Sarah chat).

**Locally verified (2026-10-22):** F-001–F-010, F-015, F-018 (gate), F-016, F-030-partial when suite + fresh loopback pass — **not** production-accepted.

| ID | Spec focus | Automation | Notes |
|----|------------|------------|-------|
| F-001 | Overview movement totals | **Auto** | `viewFinanceOverviewSummary` + seeded txs |
| F-002 | Multi-currency movement | **Auto** | ZAR + USD seed |
| F-003 | Receivables exclude quotations | **Auto** | Quotation marker invoice |
| F-004 | Period stated in tool payload | **Auto** | periodPreset 90d |
| F-005 | dataCoverage present | **Auto** | `complete` / `totalsScope` |
| F-006 | No fake profit/cash claims | **Manual** | [`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md) — **Partial** (2026-10-22 loopback): S3 **Fail** F006-S3-001; S2 not run |
| F-007 | Invoice draft not persisted until confirm | **Auto** | prepare without confirm |
| F-008 | Invoice confirm persists | **Auto** | prepare + confirm |
| F-009 | Quotation draft marker | **Auto** | notes marker on create |
| F-010 | Ledger entry draft + confirm | **Auto** | income/expense |
| F-011 | Reconciliation engine | **Deferred** | SF-05 not implemented |
| F-012–F-013 | Budgets / forecasts | **Deferred** | SF-07 |
| F-014–F-017 | BOS quotation lifecycle | **Deferred** | BOS E2E |
| F-015 | Finance Sarah allowlist | **Auto** | tool-policy script |
| F-016 | Cross-tenant 403 | **Auto** | loopback chat |
| F-017 | Quotation version binding | **Deferred** | |
| F-018–F-020 | Sarah payments | **Auto (gate)** | disabled unless env |
| F-021–F-024 | Audit / compliance stream | **Deferred** | |
| F-025–F-027 | Statutory reports | **Deferred** | SF-11 |
| F-028 | Period close | **Deferred** | SF-12 |
| F-029 | Export / report API | **Deferred** | |
| F-030 | Release sign-off bundle | **Auto** | `verify-finance-sarah-acceptance-suite.mjs` |

**Production sign-off:** Run suite on staging/production only with explicit ops approval; loopback runner must not run on Railway.
