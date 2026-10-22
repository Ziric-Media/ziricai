# SF-CORE-01 — Evidence-backed gap matrix

**MVP finish line:** [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md) — programme stops expanding Finance when MVP gate is met (local evidence + defect fixes).  
**Programme:** [`SF_CORE_01_FULL_PROGRAM.md`](./SF_CORE_01_FULL_PROGRAM.md).  
**Matrix date:** 2026-10-22  
**Branch:** `feature/company-portal-finance-v1` @ `0d2ee3d+` on `origin`.

> **Full SF-CORE-01 ≠ MVP.** Rows below include **deferred advanced** capabilities. Nothing is **production-accepted** unless explicitly marked.

---

## MVP gate (six capabilities)

| MVP # | Capability | Status (local) | Evidence |
|-------|------------|----------------|----------|
| 1 | Understand finances (read tools) | **Verified** | F-001–F-005; F1 verify |
| 2 | Invoice & quotation drafts + confirm | **Verified** | F-007–F-009; F2 verify |
| 3 | COA, GL, manual journal, trial balance | **Verified** | F3, F3b, F-010 |
| 4 | Explain without inventing figures | **Verified (local, MVP)** | F-006 S3 retest pass after prefetch; full F-006 S2 optional |
| 5 | Permissions & safe mutations | **Verified** | F-016, tool-policy, F2 gates |
| 6 | Finance portal journey | **Partial** | `js/portal/finance*`; production deploy/pilot not signed |

**Deferred (not MVP):** SF-05 reconciliation, SF-07 budgets, SF-09 Sarah payments, SF-11–12 statutory/close, F-011–F-029 advanced acceptance — see sections below.

---

## Status taxonomy

| Status | Meaning |
|--------|---------|
| **Verified** | Current code on the finance branch **and** named test/script evidence supports the claimed behaviour (memory and/or loopback). |
| **Partial** | Implementation and/or acceptance is incomplete; or evidence covers only a subset (e.g. Sarah but not portal E2E). |
| **Blocked** | Depends on unresolved remediation, env gate, or explicit approval (not safe to enable). |
| **Untested** | Code may exist; **insufficient evidence** to assert behaviour (no automated case, no signed manual review). |
| **Production-accepted** | Verified on approved live/staging tenant against acceptance criteria with documented sign-off. **None claimed for SF-CORE-01 as of this matrix.** |

**Evidence ladder (per row where relevant):** locally verified · committed · deployed · production-accepted — see full program doc.

---

## Commit evidence (Sarah Finance + portal payments)

| Commit | Summary | Primary paths |
|--------|---------|----------------|
| **b49ac9e** | F1 read intelligence | `viewFinanceOverviewSummary`, `financeTenantScan`, `dataCoverage`, read tools, unit tests, F0 audit doc |
| **74c98e5** | F2–F3b, F4 scaffold, F5 harness | Draft/confirm writes, GL COA/journals, Sarah GL read tools, `financeAcceptanceRoutes`, verify F1–F5 scripts, `navigationConsent.js` |
| **e864637** | Portal payment UI | `PAYMENTS_UI_DISABLED = false`, `financePaymentUi.js`, `recordFinanceInvoicePayment`, `app/js/portal/*` finance module copies |
| **e624c83** | Programme baseline docs | `SF_CORE_01_FULL_PROGRAM.md`, F0 stale banner, F5 partial notes |
| **648013c** | Portal import fix | `financePaymentUi.js` → `../admin/ui.js` (fixes Finance module load on app.ziricai.com) |

**Later commits on branch:** doc baseline + import fix only (no new Sarah capabilities).

---

## Working tree vs committed (Finance scope)

**Committed and pushed:** Sarah backend F1–F3b, acceptance scripts, core `js/portal/finance*.js` module graph (see `git ls-files js/portal/finance*`), portal payment enablement in `js/` + partial `app/` mirror.

**Modified but not committed (examples):** `js/portal/financeWorkspaceNav.js`, `js/portal/core/appShell.js`, `js/portal/main.js`, several `services/sarah/*` files unrelated to the three Finance commits — **do not attribute to SF-CORE-01 without review.**

**Untracked under `app/js/portal/` (examples):** `financeOverviewUi.js`, `financeSarahPanel.js`, `financeDisplay.js`, etc. — may exist on disk for deploy but **not all are in git**; Netlify no-build uploads only what is in the local `app/` tree. **Portal E2E is Partial** until git, prepare-sites, and deploy pipeline align.

**Local verify (2026-10-22):** After `npm install`, `verify-finance-sarah-acceptance-suite.mjs` **PASS** — archived at [`evidence/verify-finance-sarah-acceptance-suite-2026-10-22.txt`](./evidence/verify-finance-sarah-acceptance-suite-2026-10-22.txt). F5 automated **13/13** with loopback. **Historical only until the next archived run.**

---

## Capability matrix (SF-CORE-01 §13)

| ID | Capability | Gap status | Code evidence (committed) | Test / verify evidence | Deploy / acceptance notes |
|----|------------|------------|---------------------------|-------------------------|---------------------------|
| **SF-01** | Overview & analysis (Sarah read, periods, coverage) | **Verified** (local) | `viewFinanceOverviewSummary`, `financeOverviewSummary.js`, `financeTenantScan.js`, `dataCoverage` in read tools (`b49ac9e`+) | `verify-finance-sarah-f1.mjs`, `verify-finance-sarah-f5-acceptance.mjs` (F-001–F-005), `test/sarah-finance-overview-summary.test.mjs`, `test/sarah-view-finance-transactions.test.mjs` | **Partial** portal: overview UI in `js/portal/financeOverview*.js` (tracked); production portal depends on deploy completeness. **Not production-accepted.** |
| **SF-02** | GL / COA / journals / trial balance | **Verified** (local) | `financeCoaTemplate.js`, `financeGlAccountService.js`, `financeJournalService.js`, `financeGlReadService.js`, schema collections, API routes, Sarah `viewFinanceChartOfAccounts`, `viewFinanceTrialBalance`, `viewFinanceJournalEntries` (`74c98e5`) | `verify-finance-sarah-f3.mjs`, `verify-finance-sarah-f3b.mjs`, `test/sarah-finance-gl-projection.test.mjs`, `test/sarah-finance-journal.test.mjs`, F5 F-030-partial (loopback GL route) | API on Railway **unverified** at this matrix date. No period locks. **Not production-accepted.** |
| **SF-03** | Customer invoicing / AR (API + Sarah confirm) | **Partial** | REST invoices + `prepareFinanceInvoiceDraft` / `confirmFinanceWrite` (`74c98e5`); portal invoice UI (`financeInvoiceUi.js`, tracked) | F-007–F-010 auto in F5; `verify-finance-sarah-f2.mjs`; `test/sarah-finance-write-draft.test.mjs` | Portal invoice E2E on live tenant **untested**. Server numbering / full AR ops **untasted**. |
| **SF-04** | Supplier AP | **Partial** | Same invoice model (`invoiceKind` payable); portal filters | No dedicated AP acceptance IDs | Ops features (duplicate detection, batches) **missing** |
| **SF-05** | Transactions & reconciliation | **Partial** | Transactions CRUD, categories; no reconciliation engine | F-010 ledger draft (Sarah); **F-011 deferred** | Reconciliation **blocked** (not implemented) |
| **SF-06** | Quotations & BOS handover | **Partial** | Quotation marker, `prepareFinanceQuotationDraft`, BOS services elsewhere; Finance allowlist includes **read-only** `listBosCommercialCycles` (not `applyBosCommercialCycleAction`) | F-009 quotation marker auto; **F-014–F-017 deferred** | BOS E2E **untested** on Finance surface |
| **SF-07** | Budgets & forecasts | **Blocked** | UI shells only (`financeWorkspaceShells.js`) | F-012–F-013 deferred | No forecast service |
| **SF-08** | Expenses / petty cash | **Partial** | Transactions + categories; portal create modals | Portal verify static checks | No expense-claim workflow |
| **SF-09** | Bank / payments | **Partial** | `recordInvoicePaymentForAccess`, `financeAtomicPayment.js`; portal UI enabled (`e864637`); Sarah F4 **gated** (`financeSarahPaymentsGate.js`) | `verify-finance-services-local.mjs` (not run here); F-018 gate auto; F4 readiness script | Portal payments **deployed** app.ziricai.com; **production-accepted blocked** until [payment remediation](./FINANCE_PAYMENT_REMEDIATION_AND_TEST_PLAN.md). Sarah payments **blocked** (`FINANCE_SARAH_PAYMENTS_ENABLED` off). Firestore multi-instance payment proof **untested**. |
| **SF-10** | Tax compliance | **Partial** | Line tax on invoices (v1) | No statutory tests | No jurisdiction / filing engine |
| **SF-11** | Financial reporting | **Partial** | Overview + lists; Sarah read summaries | F-025–F-029 deferred | No report API / statutory statements |
| **SF-12** | Period close / controls | **Blocked** | Void reasons, uids on records | F-028 deferred | No period lock / close checklist |

---

## F5 acceptance matrix (F-001–F-030)

| ID | Focus | Gap status | Evidence |
|----|--------|------------|----------|
| F-001 | Overview movement totals | **Verified** (local) | F5 auto; overview tool + fixtures |
| F-002 | Multi-currency movement | **Verified** (local) | F5 auto |
| F-003 | Receivables exclude quotations | **Verified** (local) | F5 auto |
| F-004 | Period in tool payload | **Verified** (local) | F5 auto |
| F-005 | dataCoverage present | **Verified** (local) | F5 auto |
| F-006 | No fake profit/cash claims | **Verified (local, MVP subset)** | S1/S3/S7 pass loopback; S2 optional — [`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md) |
| F-007 | Invoice draft not persisted until confirm | **Verified** (local) | F5 auto |
| F-008 | Invoice confirm persists | **Verified** (local) | F5 auto |
| F-009 | Quotation draft marker | **Verified** (local) | F5 auto |
| F-010 | Ledger entry draft + confirm | **Verified** (local) | F5 auto |
| F-011 | Reconciliation engine | **Blocked** | SF-05 not implemented |
| F-012–F-013 | Budgets / forecasts | **Blocked** | SF-07 |
| F-014–F-017 | BOS quotation lifecycle | **Untested** | Deferred; no E2E evidence |
| F-015 | Finance Sarah allowlist | **Verified** (local) | `verify-finance-sarah-tool-policy.mjs` |
| F-016 | Cross-tenant isolation | **Verified** (local) | F5 loopback when `:3099` fresh |
| F-017 | Quotation version binding | **Untested** | Deferred |
| F-018–F-020 | Sarah payments | **Blocked** (Sarah) / **Partial** (API exists) | Gate tests; remediation not signed off |
| F-021–F-024 | Audit / compliance stream | **Untested** | Not implemented / not verified |
| F-025–F-027 | Statutory reports | **Blocked** | SF-11 |
| F-028 | Period close | **Blocked** | SF-12 |
| F-029 | Export / report API | **Blocked** | Not implemented |
| F-030 | Release sign-off bundle | **Partial** | Suite script exists; local pass **reported** 2026-10-22; **not** production sign-off |

**Production-accepted:** **No F-00x row** qualifies until live/staging run with ops approval and recorded results.

---

## Cross-cutting gaps (priority queue alignment)

| Priority | Theme | Gap status | Notes |
|----------|--------|------------|-------|
| **1** | Spec ↔ code reconciliation | **Verified (local)** | Gap matrix + F0 §13 refreshed 2026-10-22; executive summary table above remains historical. |
| **2** | F5 deferred acceptance | **Partial** | 13/30 automated locally; F-006, F-011, F-014–F-017, F-021–F-029 open |
| **3** | Portal Finance E2E | **Partial** | Auth/tenant mapping on Central Motors **not evidenced** here; Sarah ↔ API ↔ Firestore path on production API version **unknown** |
| **4** | Accounting depth | **Partial** | GL/journal **verified** in memory tests; reconciliation, budgets, close, export **blocked** |
| **5** | Central Motors pilot | **Untested** | Requires explicit deploy approval + documented smoke |

---

## Recommended next actions (evidence-producing)

1. ~~Restore deps and re-run acceptance suite~~ — **Done** 2026-10-22 ([archive](./evidence/verify-finance-sarah-acceptance-suite-2026-10-22.txt)).
2. ~~Refresh F0 §13~~ — **Done** 2026-10-22.
3. Record **F-006** manual review — [`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md).
4. Align **git ↔ app/** (prepare-sites or commit app mirrors) before the next Netlify production deploy.
5. Railway deploy from `648013c` + approved **Central Motors** smoke script results → only then consider selective **production-accepted** rows.
