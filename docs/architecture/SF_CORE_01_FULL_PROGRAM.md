# SF-CORE-01 — Full program (Sarah Finance + Company Portal Finance)

**Spec reference:** SF-CORE-01 v1.0 — capability matrix in [`SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md`](./SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md).  
**Program baseline updated:** 2026-10-22 (post F1–F3b implementation, F5 local acceptance, portal payment UI commit).  
**Gap matrix (Priority 1 deliverable):** [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md) — evidence-backed statuses; **does not** claim remaining work is complete.

---

## Milestone framing

Sarah Finance has moved **beyond a chatbot** into a **finance capability**: read intelligence, confirm-gated draft actions, and a general-ledger foundation. That is a strong programme milestone.

It is **not** yet proof of the **complete finance employee experience end to end** (portal + Sarah + APIs + authoritative records + production acceptance).

---

## Evidence ladder (do not conflate)

| Level | Meaning | Current notes (2026-10-22) |
|-------|---------|----------------------------|
| **Locally verified** | Named scripts/tests pass on a developer machine (memory and/or loopback `:3099`). | Reported **PASS** 2026-10-22 (F5 **13/13** with fresh loopback). Re-run may require intact `node_modules` — see gap matrix if verify fails. |
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

### Programme completion estimate

Roughly **~85% of the phased F0–F5 Sarah/backend track** (implementation through F3b, F4 scaffolded, F5 automated slice green locally).

That figure must **not** be read as “85% of everything a finance employee needs.” Substantial **end-to-end product**, **accounting**, and **acceptance** work remains (see priority queue below).

**Still not claimed at spec level:** Bank feeds, automated reconciliation, budgets/forecasts, period close, statutory filings, full BOS quotation E2E, audit/compliance stream, production pilot sign-off.

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

## Remaining work — priority queue

Do **not** jump straight into F4 Sarah payments or expand the tool surface without closing gaps in this order (reduces risk to financial records).

### 1 — Reconcile specification with current code

Refresh the stale F0 audit and compare full SF-CORE-01 with implementation, test evidence, and commits.

**Exit criterion:** One authoritative **gap matrix** (verified / partial / blocked / untested / production-accepted) aligned to SF-CORE-01 §13 and F-001–F-030. **Draft:** [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md) — refresh after each evidence-producing sprint and after F0 §13 reconciliation.

### 2 — Close F5 deferred acceptance

Prioritise:

- **F-006** — manual review of financial claims (prompt/chat behaviour).
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
