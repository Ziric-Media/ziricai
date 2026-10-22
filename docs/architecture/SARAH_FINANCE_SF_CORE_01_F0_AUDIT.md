# Sarah Finance — SF-CORE-01 · F0 foundation audit

**Specification:** SF-CORE-01 v1.0 (21 October 2026)  
**Audit date:** 2026-10-21 (initial); **baseline refresh pending** (see below)  
**Mode:** Read-only — no production changes implied by this document  
**Prior audit:** [`FINANCE_SARAH_F0_CAPABILITY_AUDIT.md`](./FINANCE_SARAH_F0_CAPABILITY_AUDIT.md) (2026-10-16); this document realigns to SF-CORE-01 and records **point-in-time** evidence.

> **Authoritative programme status (2026-10-22):** Use [`SF_CORE_01_FULL_PROGRAM.md`](./SF_CORE_01_FULL_PROGRAM.md) for phase status, evidence ladder, and priority queue. **Gap matrix (evidence-backed):** [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md). **This F0 file’s executive summary and §13 table below remain stale** — use the gap matrix for planning until §13 is line-refreshed.

---

## Executive summary (stale — refresh in progress)

The table below reflects the **2026-10-21 audit snapshot**. Implementation through **F3b**, local F5 automation, and portal payment UI (`e864637`) are **not** fully reflected here.

| Layer | Verified | Partial | Missing / blocked |
|-------|----------|---------|-------------------|
| Finance REST API (transactions, invoices, categories) | Yes | — | Quotations (invoice marker convention only) |
| Permission policy (`financePermissionPolicy`) | Yes | Role names ≠ spec matrix labels | Map viewer/officer/manager in product docs |
| Sarah Finance UI (workspace chat, pageContext) | Yes | — | — |
| Sarah Finance server allowlist | Yes | **Write BOS tools on allowlist** | — |
| Sarah Finance read tools | Partial | 4 read tools exist | **No overview/period tool**; weak completeness metadata |
| General ledger / COA / journals | — | — | **Not implemented** (SF-02 gate) |
| Bank feeds / payment execution | — | API exists | **UI + Sarah blocked** (SF-09 gates) |
| Quotation version + approval (BOS) | Partial | Backend documented | Portal + Sarah integration to verify |
| Acceptance tests F-001–F-030 | — | Harness scripts exist | **Not run as formal SF suite** |

**Implemented since this snapshot (see full program doc):** F1 read intelligence (`b49ac9e`); F2 confirm-gated writes; F3/F3b GL read + tenant COA/journals (`74c98e5`); F5 automated subset locally green; F4 Sarah payments scaffold **gated**; portal payment UI committed/deployed separately from F4 Sarah enablement.

---

## Master capability matrix (SF-CORE-01 §13)

| Capability (SF) | Existing implementation | Evidence | Gap vs SF-CORE-01 | Acceptance tests | Status |
|-----------------|-------------------------|----------|-------------------|------------------|--------|
| **SF-01** Overview & analysis | Portal Overview math (`js/portal/financeOverviewCalculations.js`); Sarah tools: `viewFinanceTransactions`, `viewOutstandingInvoices`, `viewInvoiceAging`, `viewInvoiceDetails` | `services/sarah/tools/view*.js`, `services/finance/*ForAccess` | No `viewFinanceOverviewSummary`; no period args; **no `totalsScope` / `complete` / cursor metadata**; tools use full `list()` not bounded page | F-001–F-006 | **Partial — untested** |
| **SF-02** GL / accounting foundation | Posted transactions + AR/AP invoices only | `financeTransactionService`, `financeInvoiceService`, `schema.js` | No COA, journals, trial balance, period locks | Accounting gate (spec §SF-02) | **Missing — blocked for “full accountant” claims** |
| **SF-03** Customer invoicing / AR | REST CRUD + void + payment API; portal UI | `services/api/financeRoutes.js`, `financeInvoiceService.js` | Sarah cannot draft/issue via confirmed workflow; no server numbering doc in audit | F-007–F-010 (partial) | **API partial; Sarah write untested** |
| **SF-04** Supplier AP | Payable invoices in same model | `invoiceKind` on invoices | No duplicate detection, OCR, payment batches | F-009+ | **Partial API; ops missing** |
| **SF-05** Transactions & reconciliation | Categorise via PATCH; list | Transaction service | No match suggestions, reconciliation engine | F-010–F-011 | **Partial** |
| **SF-06** Quotations & handovers | BOS + finance quotation marker (`__DOC:quotation__`) | `services/bos/*`, `js/portal/financeQuotation.js` | Version/digest approval must be re-verified E2E; Sarah `applyBosCommercialCycleAction` on Finance allowlist | F-014, F-017 | **Partial — policy conflict with read-first F1** |
| **SF-07** Budgets & forecasts | UI shells | Finance workspace nav | No forecast service | F-012–F-013 | **Missing** |
| **SF-08** Expenses / petty cash | Transactions + categories | POST transaction | No dedicated expense claim workflow | — | **Partial** |
| **SF-09** Bank / payments | `recordInvoicePaymentForAccess`, atomic payment module | `financeAtomicPayment.js`, `PAYMENTS_UI_DISABLED` | Sarah must not execute; integrity gates open | F-018–F-020 | **Blocked** |
| **SF-10** Tax compliance | Tax on invoice lines (v1) | Invoice validation | No jurisdiction engine / SARS filing | — | **Conditional / partial** |
| **SF-11** Financial reporting | Overview + invoice lists (client) | Portal modules | No report API; no statutory statements | F-025–F-029 | **Partial UI only** |
| **SF-12** Period close / controls | Void reason, uids on records | Finance services | No period lock, close checklist | F-028 | **Missing** |

---

## SF-01 detail — first implementation gap (spec-aligned)

### What works today

- **Tenant-scoped reads:** Sarah tools call `listFinanceTransactionsForAccess` / `listFinanceInvoicesForAccess` with `ctx.companyId`, `ctx.uid`, `ctx.role` from server auth — not client-supplied tenant.
- **Finance Sarah mode:** `financeSarahToolPolicy.js` + `applyFinanceSarahSessionStickiness` in orchestrator; default-deny non-allowlisted tools.
- **Deterministic summarisers:** `summariseFinanceTransactions`, `summariseOutstandingInvoices`, `summariseInvoiceAging` (minor units, void excluded from totals, per-currency groups).
- **UI context:** `buildFinanceSarahPageContext` sends workspace, sub-tab, overview period **labels** to the model (descriptive only).

### Gaps vs SF-01 and FINANCE_SARAH_1R design

| Requirement | Current state |
|-------------|----------------|
| Reporting period resolution (30d/90d/custom, Johannesburg) | Overview UI only — **not in Sarah tools** |
| Compare two periods | **Not implemented** server-side for Sarah |
| Completeness metadata (`complete`, `hasMore`, `nextCursor`, `totalsScope`) | **Missing** — `viewFinanceTransactions` loads full list then truncates history to 20 rows; totals are over **all** loaded rows (not bounded-page labelled) |
| `canViewFinance` on tools | Tools declare `requiredPermissions: []` — reliance on service assert only |
| No bank balance / profit overclaim | Prompt hints partial; need stronger Finance Sarah block + tool `limitations[]` |
| `viewFinanceOverviewSummary` (1R design) | **Not implemented** |

### Policy conflict (F1 hygiene)

`FINANCE_SARAH_ALLOWED_TOOL_NAMES` includes **`applyBosCommercialCycleAction`** (and `listBosCommercialCycles`) — **write/commercial actions** on Finance Sarah surface. SF-CORE-01 F1 scope is read intelligence; BOS writes should be **removed from Finance allowlist** or gated to explicit F2/F6 with approval UX.

---

## Integrations (SF-CORE-01 §6)

| System | Status | Sarah must use |
|--------|--------|----------------|
| `/api/portal/finance/:companyId/*` | Mounted via `services/api/financeRoutes.js` | Yes — via `*ForAccess` services |
| Firestore `financeInvoices`, `financeTransactions` | `TENANT_COLLECTIONS` | Via services only — **never LLM → Firestore** |
| Sarah orchestrator | `handleSarahChat` + tool loop | Yes |
| Quotation / BOS | `services/bos/*` | Conditional; verify version binding separately |
| General ledger | — | **Do not simulate** |
| Payment provider | Partial backend | **Disabled until SF-09 gates** |

---

## Acceptance test readiness (SF-CORE-01 §9)

| ID | Can run today? | Notes |
|----|----------------|-------|
| F-001–F-003 | Partial | Needs overview tool + golden fixtures vs `*ForAccess` |
| F-004–F-006 | Manual / prompt | Behavioural — add automated prompt+tool contract tests |
| F-007+ writes | API yes, Sarah no | F2 scope |
| F-015–F-016 | Partial | `verify-finance-sarah-f1-acceptance.mjs` (loopback harness) |
| F-017 quotation version | Untested | Requires BOS + quotation integration test |
| F-018–F-020 payments | Blocked | Payment remediation track |
| F-024 audit | Untested | No Sarah finance audit stream verified |

Scripts: `scripts/verify-finance-sarah-tool-policy.mjs`, `verify-finance-sarah-f1.mjs`, `verify-finance-sarah-f1-acceptance.mjs` (requires `dev:finance-acceptance` on 3099).

---

## F1 implementation proposal (for separate authorization)

**Objective:** Satisfy SF-01 read path and FINANCE_SARAH_1R read tools without writes.

**In scope**

1. Add `services/finance/financeOverviewSummary.js` (or re-export shared pure functions from portal calculations — **single definition**).
2. Add Sarah tool `viewFinanceOverviewSummary` (period presets, limitations, completeness).
3. Extend `viewFinanceTransactions` with optional period filters + **`dataCoverage`** (`totalsScope: "full_tenant_list" | "bounded_page"`, counts, truncation flags).
4. Set `requiredPermissions: ["canViewFinance"]` on all Finance read tools.
5. Remove `applyBosCommercialCycleAction` from Finance allowlist (keep `listBosCommercialCycles` read-only if needed).
6. Update Finance block in `sarahContext.js` / `systemPrompt.js` (SF-01 restrictions: no cash/profit/balance sheet without source).
7. Tests: extend `verify-finance-sarah-f1*.mjs` + unit tests for summarisers with fixtures.

**Out of scope (F1)**

- Invoice/quotation create from Sarah (SF-03 / SF-06 F2).
- GL, reconciliation, forecasts (SF-02, SF-05, SF-07).
- Payment POST from Sarah (SF-09).
- Deploy / production config changes.

**Files (expected touch set)**

- `services/sarah/tools/viewFinanceOverviewSummary.js` (new)
- `services/finance/financeOverviewSummary.js` (new, shared math)
- `services/sarah/tools/viewFinanceTransactions.js`
- `services/sarah/financeSarahToolPolicy.js`
- `services/sarah/tools/index.js`
- `services/sarah/sarahContext.js`, `services/sarah/prompts/systemPrompt.js` (Finance Sarah section)
- `scripts/verify-finance-sarah-*.mjs`, `test/sarah-view-finance-*.test.mjs` (pattern)

---

## Roadmap alignment (SF-CORE-01 §11)

| Phase | Maps to | Status |
|-------|---------|--------|
| **F0** | Spec freeze + this audit | **Complete (2026-10-21)** |
| **F1** | SF-01 intelligence + read tools | **Ready to authorize** |
| **F2** | SF-03–SF-06 core workflows | Blocked on F1 + quotation E2E proof |
| **F3** | SF-02 / SF-11 accounting completeness | Blocked on GL decision |
| **F4** | SF-09 payments + integrations | Blocked on payment safety gates |
| **F5** | §9 acceptance suite + release report | After F1–F4 slices |

---

*Re-run F0 when Finance API, Sarah allowlist, or BOS quotation lifecycle changes materially.*
