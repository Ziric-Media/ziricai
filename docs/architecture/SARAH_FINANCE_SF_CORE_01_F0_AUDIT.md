# Sarah Finance — SF-CORE-01 · F0 foundation audit

**Specification:** SF-CORE-01 v1.0 (21 October 2026)  
**Audit date:** 2026-10-21 (initial); **§13 refreshed** 2026-10-22  
**Mode:** Read-only — no production changes implied by this document  
**Prior audit:** [`FINANCE_SARAH_F0_CAPABILITY_AUDIT.md`](./FINANCE_SARAH_F0_CAPABILITY_AUDIT.md) (2026-10-16); this document realigns to SF-CORE-01 and records **point-in-time** evidence.

> **Authoritative programme status (2026-10-22):** [`SF_CORE_01_FULL_PROGRAM.md`](./SF_CORE_01_FULL_PROGRAM.md) (programme), [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md) (status register), **§13 below** (capability summary aligned to gap matrix).

---

## Executive summary (historical snapshot — see §13 for current)

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

**Refreshed:** 2026-10-22 — aligned to [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md). Status labels: **Verified (local)**, **Partial**, **Blocked**, **Untested**, **Production-accepted** (none claimed).

| Capability (SF) | Implementation (committed) | Gap status | Acceptance / evidence |
|-----------------|----------------------------|------------|------------------------|
| **SF-01** Overview & analysis | `viewFinanceOverviewSummary`, read tools, `dataCoverage`, portal overview UI | **Verified (local)** | F-001–F-005 auto; **F-006 manual open** — [`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md) |
| **SF-02** GL / accounting foundation | COA template, tenant GL accounts, manual journals, trial balance projection, Sarah/API read | **Verified (local)** | F3/F3b verify + unit tests; no period locks |
| **SF-03** Customer invoicing / AR | REST + Sarah confirm-gated invoice/quotation drafts; portal invoice UI | **Partial** | F-007–F-010 auto; portal E2E on live tenant untested |
| **SF-04** Supplier AP | Payable invoices (shared model) | **Partial** | No dedicated AP acceptance |
| **SF-05** Transactions & reconciliation | Transactions/categories; no reconciliation engine | **Partial** | F-010; **F-011 blocked** |
| **SF-06** Quotations & BOS | Quotation marker, `prepareFinanceQuotationDraft`; read-only `listBosCommercialCycles` on allowlist | **Partial** | F-009; **F-014–F-017 untested** |
| **SF-07** Budgets & forecasts | UI shells only | **Blocked** | F-012–F-013 |
| **SF-08** Expenses / petty cash | Transactions + categories | **Partial** | No expense-claim workflow |
| **SF-09** Bank / payments | Atomic payment API; portal UI enabled (`e864637`); Sarah F4 **gated** | **Partial** | F-018 gate; remediation + production acceptance open |
| **SF-10** Tax compliance | Invoice line tax (v1) | **Partial** | No filing engine |
| **SF-11** Financial reporting | Overview + lists; Sarah summaries | **Partial** | F-025–F-029 blocked/deferred |
| **SF-12** Period close / controls | Void audit fields | **Blocked** | F-028 deferred |

---

## SF-01 detail (post-F1 — see gap matrix for gaps)

- **Tenant-scoped reads** and **Finance Sarah allowlist** unchanged in principle (`financeSarahToolPolicy.js`, orchestrator stickiness).
- **F1 delivered:** `viewFinanceOverviewSummary`, period presets in tool args, **`dataCoverage`** on overview/transactions scan (`b49ac9e`).
- **Remaining SF-01 gaps:** period compare across two windows; stronger **`canViewFinance`** on tool metadata; **F-006** behavioural review — not closed until manual log signed ([`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md)).
- **BOS on Finance surface:** allowlist includes **read-only** `listBosCommercialCycles` only; commercial **write** actions are not on the Finance allowlist (verify via `verify-finance-sarah-tool-policy.mjs`).

---

## Integrations (SF-CORE-01 §6)

| System | Status | Sarah must use |
|--------|--------|----------------|
| `/api/portal/finance/:companyId/*` | Mounted via `services/api/financeRoutes.js` | Yes — via `*ForAccess` services |
| Firestore `financeInvoices`, `financeTransactions` | `TENANT_COLLECTIONS` | Via services only — **never LLM → Firestore** |
| Sarah orchestrator | `handleSarahChat` + tool loop | Yes |
| Quotation / BOS | `services/bos/*` | Conditional; verify version binding separately |
| General ledger | COA + journals + trial balance (F3/F3b) | Sarah read tools; not statutory |
| Payment provider | API + portal UI; Sarah F4 gated | Production acceptance per remediation plan |

---

## Acceptance test readiness (SF-CORE-01 §9)

Authoritative per-case status: [`SF_CORE_01_F5_ACCEPTANCE_MATRIX.md`](./SF_CORE_01_F5_ACCEPTANCE_MATRIX.md) and [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md).

| ID | Disposition (2026-10-22) |
|----|---------------------------|
| F-001–F-010, F-015–F-016 | Automated — **Verified (local)** when suite passes (see `docs/architecture/evidence/`) |
| F-006 | **Untested** — manual protocol required |
| F-011, F-012–F-013, F-018–F-020, F-025–F-029 | **Blocked** or deferred per gap matrix |
| F-014–F-017, F-021–F-024 | **Untested** |

Suite: `node scripts/verify-finance-sarah-acceptance-suite.mjs` (+ loopback `:3099` for HTTP cases).

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
