# SF-CORE-01 — Full program (Sarah Finance + Company Portal Finance)

**Active finish line:** [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md) — six basic capabilities; **not** the full finance employee.  
**Spec reference:** SF-CORE-01 v1.0 — [`SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md`](./SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md).  
**Status register:** [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md) (MVP vs deferred).  
**Program baseline updated:** 2026-10-22.

---

## Milestone framing

**Current programme goal:** Ship **MVP Sarah Finance** (read, draft/confirm, basic GL, honest answers, permissions, portal journey), then move to **Sarah Ops / HR / Admin**. Advanced SF-CORE-01 items (reconciliation, budgets, close, statutory, industry presets) are **deferred** — see MVP gate doc.

Sarah Finance is already a **finance capability** in code (F1–F3b on branch). MVP closure = **evidence on the gate table** + serious defects fixed, **not** every F-001–F-030 case.

---

## Evidence ladder (do not conflate)

| Level | Meaning | Current notes (2026-10-22) |
|-------|---------|----------------------------|
| **Locally verified** | Named scripts/tests pass on a developer machine (memory and/or loopback `:3099`). | **PASS** 2026-10-22 — [`evidence/verify-finance-sarah-acceptance-suite-2026-10-22.txt`](./evidence/verify-finance-sarah-acceptance-suite-2026-10-22.txt). Not production-accepted. |
| **Committed** | On git branch `feature/company-portal-finance-v1` at `origin`. | F1 `b49ac9e`; F2–F3b/F5 harness `74c98e5`; portal payments `e864637`; docs `e624c83`; import fix `648013c`. |
| **Deployed** | Live on hosting without implying sign-off. | **Portal:** `app.ziricai.com` — production deploy from local `app/` (no-build upload, Oct 2026). **API:** Railway production may lag branch; redeploy requires `railway login` + explicit release. |
| **Production-accepted** | Documented sign-off on a live/staging tenant with ops approval. | **Not claimed.** F5 manual/deferred cases and pilot checklist open. |

---

## Phase status (Sarah Finance programme)

| Phase | Scope | Programme status | Evidence (committed) |
|-------|--------|------------------|----------------------|
| **F0** | Foundation audit | **Complete** (refresh needed) | [`SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md`](./SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md) — executive summary and §13 matrix **stale vs current code**; refresh is work item 1 below. |
| **F1** | Read intelligence | **Complete** | Overview read tool, `dataCoverage`, allowlist; `b49ac9e`. |
| **F2** | Confirm-gated writes | **Complete** | Invoice / quotation / ledger drafts + `confirmFinanceWrite`; `74c98e5`. |
| **F3 / F3b** | Ledger foundation | **Complete** | COA template, trial balance projection, tenant GL accounts, manual journals (API + Sarah); `74c98e5`. |
| **F4** | Sarah invoice payments | **Disabled — gated** | Scaffold + verify readiness; **`FINANCE_SARAH_PAYMENTS_ENABLED` off** until [payment remediation](./FINANCE_PAYMENT_REMEDIATION_AND_TEST_PLAN.md) sign-off. Do not enable in production without that gate. |
| **F5** | Acceptance F-001–F-030 | **Partial** | 13 automated cases green locally; manual, deferred, and live-environment checks open — [`SF_CORE_01_F5_ACCEPTANCE_MATRIX.md`](./SF_CORE_01_F5_ACCEPTANCE_MATRIX.md). |

**Portal invoice payments (SF-09 / Tier B, not F4 Sarah):** `POST …/invoices/:id/payments` UI enabled in `e864637` and deployed to the portal; treat as **committed + deployed**, **not production-accepted** until payment remediation and live smoke are closed.

**MVP vs full spec:** Backend Sarah MVP capabilities are largely **implemented**; **acceptance** is partial (local suite green; F-006 behavioural; portal/production pilot open). Full-spec items remain **deferred** per MVP gate — do not block Sarah Ops on them.

---

## F3b — Tenant COA + manual journals (reference)

- **Storage:** `companies/{id}/financeGlAccounts`, `financeJournalEntries` (auto-seed default COA on first read).
- **API:** `GET/POST .../gl-accounts`, `GET/POST .../journal-entries`, `GET .../journal-entries/:id`.
- **Sarah read:** `viewFinanceChartOfAccounts`, `viewFinanceJournalEntries`, `viewFinanceTrialBalance`.
- **Sarah write:** `prepareFinanceManualJournalDraft` → `confirmFinanceWrite`.

---

## Verification (local)

```bash
node scripts/verify-finance-sarah-acceptance-suite.mjs
```

Optional loopback: `FINANCE_ACCEPTANCE_SKIP_PREPARE=1 npm run dev:finance-acceptance` then re-run F5 for HTTP/Sarah catalogue checks.

**Production / staging:** Run only with explicit ops approval; do not run finance-acceptance loopback mode on Railway.

---

## Execution order (MVP-focused)

| Step | Action | Exit condition | Status (2026-10-22) |
|------|--------|----------------|---------------------|
| **MVP** | [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md) checks | Gate table + local verify | **In progress** — suite PASS; F-006 S3 fix + retest; portal/deploy optional for **local** gate |
| **Defer** | Advanced F5 / SF rows | Documented in gap matrix | **Done** — not blocking Ops |
| **Pilot** | Central Motors / production | Explicit deploy + smoke | **Open** — separate from local MVP gate |

Do **not** expand Sarah Finance for deferred features. Do **not** enable F4 Sarah payments without remediation sign-off.

---

## Remaining work — priority queue (detail)

### 1 — Reconcile specification with current code ✅

Gap matrix published; F0 §13 refreshed. Refresh gap matrix after each evidence sprint.

### 2 — Close F5 deferred acceptance

Prioritise:

- **F-006** — manual review — protocol [`SF_CORE_01_F006_MANUAL_ACCEPTANCE.md`](./SF_CORE_01_F006_MANUAL_ACCEPTANCE.md).
- **F-011** — reconciliation (SF-05).
- **F-014–F-017** — full quotation / BOS workflow.
- **F-021–F-029** — audit, recovery, reporting, period close, export.

**Exit criterion:** Every requirement has **evidence** or an **explicit documented dependency**.

### 3 — Complete Company Portal Finance experience

Reconcile local Finance UI with committed backend; validate auth and tenant mapping; exercise full journeys (Sarah ↔ finance APIs ↔ persisted records).

**Exit criterion:** UI, AI tools, and backend work together **without mock responses** on a real tenant path.

### 4 — Resolve outstanding accounting capabilities

Verify GL and trial-balance integrity; implement or validate reconciliation, budgets/forecasts, period close, and export/report APIs as spec requires.

**Exit criterion:** Sarah reports **reconcile to authoritative records** and state **missing data** clearly (`dataCoverage`, limitations).

### 5 — Controlled Central Motors pilot

After review and **explicit deployment approval**: deploy approved API + portal, live smoke (COA, journal via Sarah confirm, trial balance, portal payment path if remediation signed off).

**Exit criterion:** Documented pilot acceptance; **no unresolved release-blocking defects**.

---

## Deploy reference (when authorized)

1. **Railway** — F1–F3b Sarah/API; F4 Sarah payments only if remediation + env gate approved.
2. **Netlify** — portal; prefer cloud build from GitHub branch when local `npm ci` / OneDrive locks block `prepare-sites`.
3. **Smoke** — COA list, balanced manual journal (Sarah confirm), trial balance includes journal lines; cross-check portal records.
